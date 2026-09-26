---
name: Routine backup safety
description: Backup scope and import safety choices for Routine Flow.
---

Treat routine backups as both the library and daily completion progress. Keep the file format versioned and validate it fully before any local data changes. Import should offer a non-destructive add-missing path; replacing the whole library and progress requires an explicit choice with a clear warning.

**Why:** The user requested a portable file for all routine data. A silent overwrite could destroy newer local edits or progress, while a merge-only import could not restore edits to preloaded routines that share IDs across devices.

**How to apply:** When changing backup format or storage behavior, preserve round-trip restoration, idempotent add-missing behavior, and an informed choice before replacement.