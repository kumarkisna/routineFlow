---
name: Restore test rebases
description: Safe handling of concurrent edits to the broad restore end-to-end suite.
---

When a rebase overlaps changes to the restore end-to-end suite, use the latest main-branch file as the baseline and reapply only the task-specific test changes. Then run the complete restore suite; typechecking alone can miss stale browser interactions or structurally valid but incorrect assertions.

**Why:** A large cross-feature test file accumulated overlapping edits that produced unrelated corruption and outdated UI expectations during an automatic merge.

**How to apply:** During future rebases that touch this suite, preserve incoming tests as a whole, add the focused test from the current task, and verify all restore browser tests before completing the rebase.
