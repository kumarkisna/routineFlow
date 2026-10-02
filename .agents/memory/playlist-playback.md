---
name: Playlist playback consistency
description: Why editing a saved playlist does not alter the order of a run already in progress.
---

An active playlist uses the routine order selected when the run was launched. Editing or deleting the saved playlist applies to future runs, not the active sequence. Routines that become hidden, empty, or deleted before their turn are skipped.

**Why:** Changing the remaining sequence during a session would be surprising and could interrupt the user's intended flow. Visibility must still respect the existing rule that hidden routines and steps are inactive.

**How to apply:** Preserve the launch order through player transitions. Keep each routine's completion in normal daily history, and retain voice and reminder preferences between routines.