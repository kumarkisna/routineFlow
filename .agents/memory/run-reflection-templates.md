---
name: Run reflection templates
description: Keep editable reflection defaults distinct from saved reflections for individual completed runs.
---

Routine and playlist templates are starting text, not fixed run data. Copy the template into an editable post-completion reflection, save that response under the unique run ID, and leave the template unchanged. Skipped reflections should remain fillable from History. Printable skill-outcome reports should include the reflection for their matching run only.

When a run is deferred, preserve the plain-text and rich-text template snapshot separately from the empty response. History should prefer saved response content, then the snapshot; for older deferred entries without a snapshot, fall back to the current source template when it can be identified.

**Why:** The user wants reusable defaults while preserving each run's own final reflection and outcomes.

**How to apply:** Keep template editing in routine/playlist setup separate from run-result persistence; use the same run identity for later edits and exports.
