---
name: Playlist playback and history
description: Active playlist runs preserve launch order, and routine/playlist reminder defaults feed local run alerts.
---

An active playlist uses the routine order selected when the run was launched. Editing or deleting the saved playlist applies to future runs, not the active sequence. Routines that become hidden, empty, or deleted before their turn are skipped.

Playlist history is limited to routine completions explicitly tagged with the playlist that launched them. Standalone completions and older history without a playlist source remain excluded rather than being inferred from current playlist membership. Keep the source ID and title with the completion so deleted or renamed playlists remain identifiable.

Skill ratings are requested once at the end of a playlist by default, covering skills assigned to its playable routines and the playlist itself. Users can turn this off to keep per-routine prompts; playlists without a stored choice default to on.

Each person's profile stores default reminder settings. Direct routine runs use the active person's values, and new playlists copy them at creation; saved playlists keep their own editable values instead of live-syncing later profile changes.

**Why:** Changing the remaining sequence during a session could interrupt the user's intended flow; inferring history from current membership misattributes past completions. The user also requested playlist-end ratings as the default while retaining an option for per-routine prompts, and asked for person-level reminder defaults to work in routine and playlist runs.

**How to apply:** Preserve launch order and voice/reminder preferences through player transitions. Request notification permission before playback when reminders are enabled, schedule local alerts for the active step/routine end, and refresh them after returning from device settings. Attach playlist source data only when a run was launched from that playlist; keep history filters based on recorded source IDs. Keep playlist-rating defaults on for new and older playlists unless explicitly saved off, and use each person's rating preference only to initialize new playlists.