---
name: Routine scheduling behavior
description: Execution and time-zone decisions for future routine and playlist schedules.
---

Scheduling means a one-time future appointment with an optional local phone reminder, not unattended background playback. Users tap Start to run the routine or playlist. Ordinary schedules reference existing routines/playlists, so source edits apply when started; hidden, missing, or empty sources cannot run.

**Why:** Mobile operating systems do not reliably allow an app to launch itself and begin speech or timer playback at a future time. Manual launch also avoids unexpectedly starting audio.

**How to apply:** Do not promise automatic background execution or exact notification delivery. Notification taps open the schedule screen. Convert the selected device-local date/time into a fixed instant; show it using the current device time zone. Reject nonexistent local times during daylight-saving transitions rather than silently shifting them.

Users can edit a scheduled playlist for that appointment only. This date-only version owns its playlist name and ordered routine references (including repeats), without modifying the original playlist or other appointments. Rescheduling keeps that version; selecting a different source removes it. Routine contents remain live, and inactive routines are skipped. Customized appointments remain usable if the original playlist is deleted.

**Why:** The user explicitly asked to edit the scheduled playlist only for that date while keeping the original unchanged. A complete local sequence avoids later original playlist edits silently changing an already-customized appointment.

**How to apply:** Keep date-only mutations confined to schedule storage. Starting uses the customized sequence when present. Reverting to the original must be explicit and confirmed; closing the editor does not save drafts.

Copying a schedule to another date creates a separate appointment, rather than moving the previous one. Date-only playlist versions are copied independently, including order and repeats; reminder identities and completion history are not copied.

**Why:** The user asked to reuse a previous date's schedule for a new date. This must remain distinct from rescheduling, which moves an existing appointment.

**How to apply:** Keep the previous entry and its reminder untouched, require a future destination, and ensure editing or deleting the new copy cannot change the previous date's playlist version.