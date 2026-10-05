---
name: Local person profiles
description: Whole-application person isolation and safe copying between local profiles.
---

People are local profiles, with default “Me.” A selected person owns their routines, playlists, schedules, selected theme, history, and other saved application data, not just a filtered routine list.

**Why:** The user requested whole-application saved-data separation and the ability to create more items or copy selected items from another person.

**How to apply:** Scope future saved preferences and data to the active person. Preserve existing data as Me without a destructive migration. Profile switching must not expose another person’s in-memory run or editing state.

Copies append independent items and include referenced dependencies. They retain routine settings, playlist order/repeats, schedule dates, date-only overrides, and alert lead times, but not completion history or native notification identifiers.

**Why:** Copying must not alter the source or duplicate its phone alerts. Existing reminders belong to their original person even while another person is active.

**How to apply:** Copied schedules start with phone reminders disabled and explain how to enable them. Switching profiles alone must not cancel existing phone reminders. Reminder taps must open the owning person; older unowned reminders belong to Me.

Full-person exports must include that person's routines, playlists, schedules, and selected theme.

**Why:** The user explicitly requested those four sections in each person's export.

**How to apply:** Keep future person-backup exports scoped to the active profile and include all four sections.

Routine Flow intentionally has no backup email feature or per-person email settings. Person backups use JSON export/import and stay scoped to the active person.

**Why:** The user asked to remove email because of Resend setup uncertainty and concern about future charges.

**How to apply:** Do not add email sending or per-person email configuration unless the user explicitly requests it. Removing app-side email does not disconnect the workspace's Resend integration.

When local routine data cannot validate at startup, offer a targeted, explicit repair and preserve the raw routine payload before changing it. Do not clear the profile or app storage to recover one malformed step.

**Why:** The user asked to recover the app without losing other saved routines or profile data and said not to recommend clearing app storage as the fix.

**How to apply:** Change only the malformed routine fields, keep a recovery copy first, and leave playlists, schedules, progress, themes, and profile records untouched.