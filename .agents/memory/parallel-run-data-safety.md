---
name: Parallel run data safety
description: Data-preservation constraint for running more than one routine at a time.
---

Parallel run support must not rewrite, migrate, or replace saved routines, playlists, or completion history. Each in-progress run has its own ephemeral timer and step state; completion stays on the existing routine-completion flow. Group ratings are added only to selected profiles’ skill records, matching skills by name and creating a missing skill only when that person’s rating is saved. Optional admin mode excludes the active profile from group ratings and notes.

**Why:** The user explicitly said the change must not break existing data, approved creating missing skills for selected participants, and requested an optional mode where the facilitator is not rated.

**How to apply:** Keep concurrent execution state separate from persisted source records. For group ratings, append only to each selected person’s skill catalog; do not copy or alter their routines or progress. When admin mode is on, never create a self-rating or self-reflection for the active profile.
