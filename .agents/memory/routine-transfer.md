---
name: Routine transfer safety
description: Product decision for importing routine backups without replacing local edits
---

Routine backup imports should be additive and repeatable. Identical routines already present are skipped; if a backed-up routine has the same ID as a changed local routine, retain both by assigning the imported copy a new ID. Do not silently overwrite the local version.

**Why:** Starter routines use stable IDs across installations, so an ID collision can represent a customized routine rather than a harmless duplicate. Keeping both avoids accidental loss of either version.

**How to apply:** When extending or changing the routines transfer format, preserve the non-destructive merge behavior or request an explicit user choice before introducing replacement.

Daily completion history follows the same rule: it is optional in backups, requires an affirmative choice to import, and contributes only missing completed steps. Never replace a local completion value (including an explicit incomplete value); remap backup history to whichever local routine represents the imported routine, including a conflict copy.

**Why:** Restoring an older device's progress should not undo deliberate changes on the current device or attach history to a customized routine with a reused ID.

**How to apply:** Keep history import additive and routine-ID-aware in future backup format or merge changes.

When a restore has committed routines but fails to confirm the history save, report that uncertainty and allow the same backup to be retried against the already-saved routines, rather than attempting a rollback that might fail too.

**Why:** Local storage writes are separate operations. A failed history write may leave routines saved, and even a rejected write may have committed before reporting an error.

**How to apply:** Preserve the saved routine state on partial restore failures and keep repeat imports idempotent so retrying can finish missing history without creating duplicate routines.

Backups may retain completions for removed steps of a routine that remains in the backup, but should not attach history to a routine absent from it without an explicit identity strategy.

**Why:** A surviving routine provides a safe identity for remapping past step keys on import. A deleted routine does not; matching its old ID to an unrelated local routine would misattribute history.

**How to apply:** When expanding history portability to deleted routines, define collision-safe remapping and validate it separately from historical steps of existing routines.