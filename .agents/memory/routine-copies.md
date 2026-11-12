---
name: Routine copies
description: Product decision for duplicating routines without sharing completion state
---

A copied routine should preserve its step content, order, durations, and visibility settings, but be a distinct routine with fresh progress. Its title should identify it as a copy.

Copied steps must remain independently editable in the new routine, without changing the source routine.

**Why:** Reusing the original routine's completion identity would make a new routine appear partly finished. Independent edits let users adapt a copy without changing the source.

**How to apply:** Changes to copying, history transfer, or progress accounting should preserve step settings and order, keep each copy editable, and not carry completed steps onto a new copy unless the user explicitly requests that behavior.