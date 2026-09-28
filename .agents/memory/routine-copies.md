---
name: Routine copies
description: Product decision for duplicating routines without sharing completion state
---

A copied routine should preserve its step content, order, durations, and visibility settings, but be a distinct routine with fresh progress. Its title should identify it as a copy.

**Why:** Reusing the original routine's completion identity would make a new routine appear partly finished and make later edits to one routine harder to reason about independently.

**How to apply:** Changes to copying, history transfer, or progress accounting should not carry completed steps onto a new copy unless the user explicitly requests that behavior.