---
name: Routine step details
description: Requirement and compatibility rule for multiple details on a routine step.
---

Each routine step keeps its existing detail and lets users add or remove additional detail entries on demand. Users can choose per step whether its details are spoken; older steps speak details by default.

**Why:** The user asked for multiple details and then chose per-step speech control. Defaulting older steps to spoken preserves existing behavior.

**How to apply:** Preserve detail order and the per-step speech choice when editing, copying, importing, and displaying routines. Turning speech off omits details only; the step title and duration remain spoken.