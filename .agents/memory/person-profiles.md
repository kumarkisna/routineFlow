---
name: Local person profiles
description: Whole-application person isolation and safe copying between local profiles.
---

People are local profiles, with default “Me.” A selected person owns their routines, playlists, schedules, selected theme, history, and other saved application data, not just a filtered routine list.

**Why:** The user requested whole-application saved-data separation and the ability to create more items or copy selected items from another person.

**How to apply:** Scope future saved preferences and data to the active person. Preserve existing data as Me without a destructive migration. Profile switching must not expose another person’s in-memory run or editing state.

Speech voice choice is person-specific. New profiles use the device default, all-profile backups preserve each selection, and an unavailable voice falls back to the current device default.

**Why:** The user approved a voice selector in person settings rather than one global choice and confirmed it works.

**How to apply:** Save the platform voice identifier on that profile and use it only when the current device reports that identifier as available.

Copies append independent items and include referenced dependencies. They retain routine settings, playlist order/repeats, schedule dates, date-only overrides, and alert lead times, but not completion history or native notification identifiers.

**Why:** Copying must not alter the source or duplicate its phone alerts. Existing reminders belong to their original person even while another person is active.

**How to apply:** Copied schedules start with phone reminders disabled and explain how to enable them. Switching profiles alone must not cancel existing phone reminders. Reminder taps must open the owning person; older unowned reminders belong to Me.

Skill ratings, their optional reflection notes, and the shared rolling-average window are person-scoped. Copying routines or playlists into another person includes any required skill definitions and assignments, but not the source person's rating history. Full-person backups preserve the ratings, notes, and window.

**Why:** Ratings represent an individual's practice history; copying them to another person would misattribute that history.

**How to apply:** Keep rating history with its profile during copies and profile switches, while allowing a full backup to round-trip ratings for the same person.

Reflection notes are attached to individual skill ratings after routine completion. Keep each note visible beside that rating in skill history and under its matching completed routine in History.

**Why:** The user requested notes alongside skill ratings, available in both histories to support improvement.

**How to apply:** Persist an optional note on the rating record and keep it with the rating through person backups and imports.

When adding or editing a reflection later, update only the note on the targeted existing rating ID. Preserve its score, timestamps, and run association, and keep multiple ratings for the same skill as separate targets.

**Why:** A reflection correction should not change the user's score or merge reflections from distinct runs.

**How to apply:** Use both skill ID and rating ID for a note-only update; do not create a new rating or change the rating's event metadata.

Ratings added later from History must use the completion date the app actually retained, rather than inventing a completion time. Backfill IDs stay stable for that routine or playlist on that day so adding remaining ratings does not create duplicate sessions.

**Why:** Legacy progress is stored at day-and-routine granularity and does not retain an exact completion timestamp or an individual playlist-run identifier.

**How to apply:** Keep retrospective ratings attached to the recorded day and mark the rating time separately. Do not split legacy same-day records into fabricated run instances.

Full-person exports must include that person's routines, playlists, schedules, and selected theme.

**Why:** The user explicitly requested those four sections in each person's export.

**How to apply:** Keep the single-person export scoped to the active profile and include all four sections.

All-profile backups should be one file containing a separate full backup for every local profile, preserving each person's own skill history and the active profile selection.

**Why:** The user asked for a backup covering all profiles in one file and for imports to keep past data intact.

**How to apply:** Snapshot each person independently. Export the persisted profile ID as `profileNumber` beside the name and match imports by this stable identifier, never by name; older archives may fall back to `id`. Add missing profiles and merge matching profiles without deleting local records; remap related IDs, keep each person's ratings and notes with that profile, and restore the archive's active profile and settings. Recreate schedule alerts only when the platform and permissions allow; otherwise leave imported alerts off.

Routine Flow intentionally has no backup email feature or per-person email settings. Backup files are generated locally for users to save or share.

**Why:** The user asked to remove email because of Resend setup uncertainty and concern about future charges.

**How to apply:** Do not add email sending or per-person email configuration unless the user explicitly requests it. Removing app-side email does not disconnect the workspace's Resend integration.

When local routine data cannot validate at startup, offer a targeted, explicit repair and preserve the raw routine payload before changing it. Do not clear the profile or app storage to recover one malformed step.

**Why:** The user asked to recover the app without losing other saved routines or profile data and said not to recommend clearing app storage as the fix.

**How to apply:** Change only the malformed routine fields, keep a recovery copy first, and leave playlists, schedules, progress, themes, and profile records untouched.