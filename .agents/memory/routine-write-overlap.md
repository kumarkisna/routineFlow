---
name: Routine write overlap
description: Why shared routine mutations must not save overlapping snapshots
---

Routine writes should reject overlapping operations rather than allow parallel persistence while mutations are based on render-captured arrays.

**Why:** Two saves can each serialize a different snapshot; whichever finishes last can silently erase a successful category rename, visibility update, or import. Queuing alone is insufficient if the queued operation still uses a stale captured array.

**How to apply:** Keep newly added routine mutations under the same write guard. If replacing rejection with serialization, compute each queued change from the latest committed state at execution time and preserve import's partial-write safety handling.