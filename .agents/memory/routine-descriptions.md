---
name: Routine descriptions
description: Behavior for optional rich routine descriptions and speech.
---

Routine descriptions retain plain text for compact views and older data, with optional rich HTML for formatted detail views. Description speech is enabled by default and can be disabled per routine; when enabled, speak it once before the first step announcement, including playlist playback.

**Why:** This follows the established default for step-detail speech while allowing users to mute descriptions that are not useful aloud.

**How to apply:** Preserve both plain text and rich HTML through routine edits, copies, and backup import/export. Missing speech settings mean enabled for backward compatibility. Strip markup before speech and render formatted descriptions only in full-detail views.
