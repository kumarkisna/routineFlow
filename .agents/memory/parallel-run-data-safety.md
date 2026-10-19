---
name: Parallel run data safety
description: Data-preservation constraint for running more than one routine at a time.
---

Parallel run support must not rewrite, migrate, or replace saved routines, playlists, or completion history. Each in-progress run has its own ephemeral timer and step state; completion is recorded only through the existing routine-completion flow.

**Why:** The user explicitly said parallel runs must not hamper existing data.

**How to apply:** Keep concurrent execution state separate from persisted source records and preserve existing completion writes.
