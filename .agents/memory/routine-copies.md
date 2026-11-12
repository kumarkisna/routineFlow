---
name: Routine copies
description: Product decision for duplicating routines without sharing completion state
---

A copied routine should preserve its step content, order, durations, and visibility settings, but be a distinct routine with fresh progress. Its title should identify it as a copy.

Copied steps must remain independently editable in the new routine, without changing the source routine.

When making or editing a routine, users can select individual steps or all visible choices from another routine. Category and skill filters narrow the sources, and keyword search applies within the currently filtered results. Every step has a Details control, selection opens it by default, and empty details show a clear message. Details can be previewed aloud before copying; copied steps retain their existing details and settings.

**Why:** Reusing the original routine's completion identity would make a new routine appear partly finished. Independent edits let users adapt a copy without changing the source. The user also requested selective step copying with category/skill filters, keyword search within the filtered results, and detail/speech previews in both creation and editing; an always-visible Details control avoids hiding steps with no extra text.

**How to apply:** Changes to copying, history transfer, or progress accounting should preserve step settings and order, keep each copy editable, and not carry completed steps onto a new copy unless the user explicitly requests that behavior. For step-copy selection, retain source step order and deep-copy nested step data.