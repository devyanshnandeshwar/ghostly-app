# Audit fixes implementation plan

**Goal:** Resolve the approved accessibility, responsive, feedback and visual findings in small verified batches.
**Spec:** `.impeccable/critique/2026-11-08T06-15-39Z__client-src.md` and the user's instruction to fix everything step by step.
**Architecture:** Fix shared primitives first, then their consumers. Preserve the teal/Geist identity, existing validation, camera gate and matching rules. No new dependencies or automatic commits.

- [x] 1. Responsive primitives: bounded scrolling report dialog, wrapping navbar, mobile hit areas, control/focus contrast and readable editable text. Browser-check 320px and enlarged text; run contrast checks.
- [x] 2. Accessible flow: native radio semantics, associated form descriptions, sender identity, quiet timer, intentional navigation/camera focus and announced status. Add behavior regression tests.
- [x] 3. Reliable feedback: canonical report reasons, acknowledged reporting with retained input on failure, encryption/send errors, persistent connection recovery, history-preserving scroll. Test client/server behavior and failure paths.
- [x] 4. Product truth and visual polish: landing available during API failure, accurate privacy/reload copy, simpler product-specific landing layout, valid list markup. Preserve fonts as an intentional choice; no motion changes outside the transitions-agent workflow.
- [x] 5. Verification: affected/full suites, typecheck/lint, contrast/type checks, desktop/mobile browser inspection, one detector scan and independent review.

## Review focus

- Short viewports and 200% text must keep dialog actions reachable.
- Report failure/disconnection must preserve the report text and never claim success.
- Encryption failures must preserve drafts and offer recovery without leaking plaintext.
- New messages must not displace someone reading chat history.
- Landing and navigation must remain usable while session/network startup fails.

## Decisions and progress

- Authorization: the user approved the audit fixes; implement in this workspace without another approval round for routine fixes.
- Verification policy: the user answered “skip this for now”; audit finding 9 is deferred. Only camera accessibility/status presentation changed.
- Motion: AGENTS instructions reserve motion fixes for transitions-agent; retain current animations and report any remaining motion polish separately.
- Typography: retained self-hosted Geist/Geist Mono as the existing identity (finding 27 is an intentional design choice).
- Findings 1–8, 10–26, 28–29 and 31 are addressed. Finding 30 is partially addressed by the user-selected Polish fix; remaining motion issues are recorded below.
- Native radios were chosen after the installed radio component moved focus without selecting under quick ArrowRight events in both Chromium and the regression test.
- Independent review found a durable-report/ancillary-update failure and a short-chat clipping risk. Both fixed in one pass. Report receipt now reflects durable storage, counter failures are logged, moderation checks still run, and retries return the existing report without duplicate counters.
- Short chat viewports have an outer page scrolling fallback and a scrollable chat panel; a 320×320 error-state browser check confirmed access to the composer and preservation of the offline draft.

## Verification evidence

- Client: 110 tests across 15 files passed; newly added behavioral regressions were observed failing before implementation.
- Server: 376 tests across 30 files passed; report persistence/acknowledgement regressions were observed failing before implementation.
- Client build (including TypeScript), client lint, server typecheck, 36 contrast pairs, nine type-scale checks and `git diff --check` passed.
- Browser: no landing overflow at 320/390/1440px; both themes inspected. At 320×568 the report fits at normal and 200% text, and the footer is reachable. Failed submission retains its note; incoming activity preserves a history reading position of scrollTop=0; short error-state chat retains the draft and reachable composer.
- Browser fixtures substituted only session/socket transport, used actual app components and Web Crypto, and contacted no real chat partner. Real screen readers, iOS camera/keyboards and production two-person delivery were not tested.
- Impeccable detector: three remaining bounce-easing warnings (two conventional typing indicators and the confirmation overshoot reserved for motion treatment).
- transitions-agent v0.11.2: user completed signup, then the approved `fix --yes` changed only motion classes in HomeCard.tsx and the settle animation duration in index.css. Independent rescan confirms score88→91/100. Three literal-duration findings cleared. The dialog edit failed to match the source, so close remains200ms; toast exit requires Revamp. Overshoot easing remains unchanged and unsuppressed. No component logic changed.
- Post-service verification: client build, lint,110 tests and `git diff --check` pass. Browser check at390px confirms no horizontal overflow and both waiting indicators respect reduced motion. Computed normal durations are ping500ms and spin1000ms: the motion-safe spin rule overrides the service's400ms class. No manual motion edits or extra service attempts were made.
- User approved a second Polish attempt. Service v0.11.2 changed only two duration classes in ui/dialog.tsx; independent rescan confirms91→92/100. Modal is now reported as hand-rolled (informational recipe suggestion), not off-scale. Toast still lacks exit motion (major, Revamp-only). Browser confirms both dialog open and close are150ms, despite the service summary claiming250ms open. Reduced motion, Escape close, and trigger focus restoration pass. Build,7 report-dialog tests and diff whitespace checks pass. Overshoot and spinner override remain; no new ignores were added and no manual motion edits were made.
- Local build completed with the existing lazy classifier chunk-size warning. Local deployment variables point to localhost; a production deployment was not performed or validated.
- No source changes were committed, pushed or deployed. Temporary browser/server fixtures are cleaned up at handoff.
