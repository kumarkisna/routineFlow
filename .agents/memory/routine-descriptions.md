---
name: Routine descriptions
description: Behavior for optional rich routine descriptions and speech.
---

Routine descriptions retain plain text for compact views and older data, with optional rich HTML for formatted detail views. They can hold multiple images and documents using the same managed attachment lifecycle as step details. Description speech is enabled by default and can be disabled per routine; when enabled, speak it once before the first step announcement, including playlist playback.

**Why:** This follows the established default for step-detail speech while allowing users to mute descriptions that are not useful aloud. The user also explicitly wants multiple images and documents in both routine descriptions and step details.

**How to apply:** Preserve plain text, rich HTML, attachments, and speech settings through routine edits, copies, and backup import/export. Restore missing app-managed attachment files from backup bytes and retain them during cleanup while referenced. Missing speech settings mean enabled for backward compatibility. Strip markup before speech and render formatted descriptions only in full-detail views.
