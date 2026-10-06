---
name: Playlist playback and history
description: Active playlist runs preserve launch order, and playlist history uses explicit run-source tags.
---

An active playlist uses the routine order selected when the run was launched. Editing or deleting the saved playlist applies to future runs, not the active sequence. Routines that become hidden, empty, or deleted before their turn are skipped.

Playlist history is limited to routine completions explicitly tagged with the playlist that launched them. Standalone completions and older history without a playlist source remain excluded rather than being inferred from current playlist membership. Keep the source ID and title with the completion so deleted or renamed playlists remain identifiable.

**Why:** Changing the remaining sequence during a session could interrupt the user's intended flow. Inferring playlist history from current membership would misattribute past completions, and older records do not reliably identify their launch source.

**How to apply:** Preserve launch order and voice/reminder preferences through player transitions. Attach playlist source data only when a run was launched from that playlist; keep routine and playlist history filters based on those recorded source IDs.