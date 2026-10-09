---
name: Post-merge setup duration
description: Runtime expectations for the workspace post-merge dependency install and database check.
---

The workspace post-merge setup needs a timeout of at least five minutes. A frozen pnpm install can spend several minutes linking hundreds of already-cached workspace packages before the database push runs.

**Why:** The original 20-second timeout and a 120-second retry both expired during dependency linking; the 300-second run completed successfully, then the database push reported no schema changes.

**How to apply:** Keep the configured post-merge timeout at or above 300000 ms and verify changes with the full post-merge setup rather than judging success from the install's early progress output.
