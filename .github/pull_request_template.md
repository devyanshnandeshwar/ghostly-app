## What changed

<!-- One or two sentences. The diff shows the rest. -->

## Why

<!--
What was wrong before, and why this fix rather than the obvious alternative.
This is the part reviewers cannot reconstruct from the code.
-->

## How it was verified

<!-- Real commands and real output, not "should work". -->

- [ ] `cd server && bun run test && bun run typecheck`
- [ ] `cd client && bun run test && bun run lint && bun run build`
- [ ] Coverage did not regress (`bun run test:coverage` in both)

## Deployment impact

<!-- Delete if none. -->

- [ ] No new environment variable
- [ ] No change to `vercel.json` CSP or `render.yaml`
- [ ] Safe to deploy without a coordinated rollout

## Deliberately not addressed

<!-- Scope you consciously left out, so review does not re-litigate it. -->
