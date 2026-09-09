# Re-matching people you have already talked to

**Date:** 2026-09-10
**Status:** Approved, not yet implemented

## Problem

Two people who have had a conversation can never be paired again. `pastMatches`
is consulted for every candidate on every join and any overlap in either
direction disqualifies the pair outright (`queue.store.ts:129-133`).

That is too strong. On a small pool it burns through the available population:
every conversation permanently removes one person from a user's future matches,
and the only relief is the 200-entry cap, which quietly makes the oldest
partners eligible again after a few hundred conversations.

Meeting someone again should be possible. What should *not* be possible is being
put back in front of someone you reported.

## Current behaviour

- `pastMatches: string[]` lives on `UserSession`, capped at 200 by
  `rememberMatchUpdate` (`matchHistory.ts`), and is mirrored into
  `QueueSessionView` so the join path costs no extra read.
- `claimMatch` skips any candidate where either side's `pastMatches` contains
  the other, and returns `null` if no eligible candidate is found.
- Reports are stored in the `Report` collection. They increment counters and can
  auto-limit an account via `statusForReportCount`, but they have **no effect on
  who you are matched with**. A reported user can be matched with their reporter
  again the moment the `pastMatches` cap rolls over.

## Requirements

1. Two people who have already talked **can** be matched again.
2. A stranger is always preferred over someone you have already talked to.
3. If either person has reported the other, they are **never** matched again.
4. Rule 3 outranks rule 1: a report is not softened by anything.

## Non-goals

Explicitly considered and dropped:

- **No block feature.** Reporting is the only permanent exclusion. No Block
  button, no block collection, no block socket event.
- **No time-windowed cooldown.** Deprioritisation is ordering, not a clock.
- **No unblock / un-report flow.**

## Design

### 1. `claimMatch` becomes a two-pass search

One loop, one remembered fallback. Pseudocode:

```
fallback = null

for each bucket in bucketsToSearch(...) order:
    for each entry in bucket:
        stale (queuedAt <= cutoff)        -> remove, continue
        entry.sessionId == self           -> remove, continue
        excluded (see 2, either direction) -> continue
        met before (pastMatches, either direction):
            if fallback is null: fallback = entry
            continue
        remove(entry); return entry          // a stranger

if fallback: remove(fallback); return fallback
return null
```

**Properties this gives:**

- A stranger anywhere in any searched bucket beats a previous partner. This is a
  deliberate change to bucket priority: a stranger in a *lower*-priority bucket
  now wins over a previous partner in a *higher*-priority one. Preference
  ordering still fully decides which *stranger* is chosen.
- The fallback is the first previous partner encountered in bucket priority
  order, so preference ordering still decides among previous partners too.
- An excluded pair is claimed by neither pass. Both parties keep waiting.
- Stale-entry eviction and self-eviction are unchanged and still happen during
  the scan, including for entries that would otherwise become the fallback.

No new data is needed for this. `pastMatches` keeps its current meaning,
storage, 200-entry cap, `matchHistory.ts` helper and cache mirroring **entirely
unchanged** — only its enforcement moves from "exclude" to "deprioritise".

### 2. `excludedSessions` — the report-derived exclusion

New field on `UserSession`, the same shape as the existing `pastMatches`:

```ts
excludedSessions: { type: [String], default: [] }
// e.g. ["6512f0a1b2c3d4e5f6a7b8c9"] — session ObjectId strings
```

- Added to `QueueSessionView` and to `QueueEntry`, alongside `pastMatches`.
- Added to `CACHED_FIELDS` in `services/cachedFields.ts`, so `updateSession`
  invalidates the cached view when it changes. That file's comment already warns
  that a cached field missing from that set goes stale silently; this is the
  documented step.
- Populated by `createReport`: the reported party is added to the **reporter's**
  list with `$addToSet`.
- Checked symmetrically in `claimMatch`:
  `candidate.excludedSessions.includes(entry.sessionId) ||
   entry.excludedSessions.includes(candidate.sessionId)`

Writing one side and checking both is exactly how `pastMatches` already works,
so one write covers both directions and there is no second document to keep in
step.

**Why a derived array rather than querying reports.** The `Report` collection
stays the source of truth for moderation and audit. This array exists only so
the join path costs no extra database read — the same reason `pastMatches` is
carried on the session document and cached. Querying `Report` per join, or even
per cache miss, would reintroduce the cost the session cache was built to
remove.

**Why it is safe to leave uncapped.** `pastMatches` grew on every single match
and had to be capped. This does not: `createReport` allows at most 3 reports per
reporter per rolling 24 hours (`MAX_REPORTS_PER_WINDOW`), and sessions expire
after 30 days of inactivity, bounding a realistic list at roughly 90 entries.
`$addToSet` also makes repeat reports of the same person idempotent.

**Consequence of the derived copy:** a `Report` document expiring under its TTL
(`REPORT_RETENTION_DAYS`, default 365) does not remove the exclusion. This is
intended — the exclusion should outlive the moderation record — and in practice
the session expires long before the report does.

### 3. Report flow

`createReport` already writes to both sessions for its counters. The exclusion
write goes in the same place, after the report is successfully created, so a
report rejected by the abuse limit or the duplicate guard records nothing.

Both writes go through `updateSession`, which is the only place `UserSession`
documents are updated and which handles cache invalidation.

### 4. Client

No functional change required. One copy change in `ReportModal`: state that
reporting also prevents being matched again, which is now true and worth saying
at the point of decision.

## `server/scripts/verify-rematch.mjs` inverts

This script (committed in `6114844`) drives a live server and asserts the rule
this change removes. It exits **1** with "BUG REPRODUCED" when two users are
re-matched and **0** with "correct: no rematch" when they are not.

After this change, a re-match is the correct outcome, so the script's pass and
fail meanings swap. It is not run by CI — it needs a live server and a
`ghostly-mongo` container — so nothing will catch this automatically, and left
alone it will tell the next person who runs it that a working feature is a bug.

It must be updated as part of this work, not afterwards:

- Round 2 expecting a match becomes the **pass** condition, since the pair are
  now each other's only candidate and the fallback pass should claim them.
- Add a third round: file a report from Alpha against Beta, then have both
  rejoin, and assert **no** match. That is the new rule the script should be
  guarding, and it is the part unit tests cannot prove end to end.
- Rename to `verify-rematch-policy.mjs` so the filename does not imply the old
  assertion.

## Existing tests that must change

Three tests in `queue.store.test.ts` assert the old rule directly. These are
deliberate behaviour changes, not regressions:

| Test | Now | After |
|---|---|---|
| `skips someone already matched before` | expects `null` | expects the previous partner, since they are the only candidate |
| `skips someone who has us in THEIR history, not just ours` | expects `null` | expects the previous partner, for the same reason |
| `looks past the first five ineligible candidates` | expects `fresh` | unchanged, and now stronger: it pins that a stranger beats five previous partners |

The two `null` expectations move to the exclusion case, where `null` is still
the correct answer.

## Test plan

New coverage in `queue.store.test.ts`:

- a stranger is claimed while a previous partner waits in the queue
- a previous partner is claimed when they are the only candidate
- a stranger in a lower-priority bucket beats a previous partner in a
  higher-priority one
- among several previous partners and no strangers, bucket priority still
  decides which is claimed
- an excluded pair is claimed by neither pass, and both remain queued
- exclusion holds from either direction (reporter's list, and reported's)
- exclusion outranks deprioritisation: a pair who both talked *and* reported is
  never claimed
- a stale entry that would have been the fallback is still evicted

In `report.service.test.ts` (new file):

- a successful report records the exclusion on the reporter
- a report rejected by the abuse limit records nothing
- a duplicate report records nothing and does not double-write
- repeat reports of the same person do not duplicate the entry

In `cachedFields.test.ts`:

- an update touching `excludedSessions` invalidates the cached view

## Risk accepted

Reporting now permanently and silently shrinks the reporter's match pool, and
the report flow has no confirmation step and no undo. A misclick is
irreversible. Recorded deliberately; not addressed here.
