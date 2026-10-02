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