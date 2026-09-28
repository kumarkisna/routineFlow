---
name: Routine visibility behavior
description: Product decision about the meaning of hiding routines and steps
---

Hidden steps are omitted from routine runs, spoken instructions, timer notifications, duration totals, and daily progress. Hiding is reversible; it should not delete saved step details or completion history. Hidden routines stay recoverable, but are excluded from the normal home list and overall daily progress.

**Why:** When offered display-only hiding versus skipping hidden steps during runs, the user explicitly chose skipping them. Visibility therefore controls which steps are active, not merely which rows render.

**How to apply:** Any future routine-running, completion, or progress feature should use only visible steps; provide an obvious way to reveal and restore hidden items.