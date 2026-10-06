---
name: Routine step details
description: Requirement and compatibility rule for multiple details on a routine step.
---

Each routine step keeps its existing detail and lets users add or remove additional detail entries on demand. The main detail and every additional detail have independent speech settings, defaulting to spoken. Older steps without per-detail settings remain spoken; an older saved per-step speech choice is honored when its details are first edited.

**Why:** The user clarified that speech must be selectable per individual detail, not as one switch for all details on a step. Preserving the legacy per-step setting avoids changing saved routines unexpectedly.

**How to apply:** Keep each detail's speech flag aligned with the ordered main/additional details through editing, copying, import, and export. Missing flags mean spoken. Turning one off omits only that detail; the step title, assigned skills, other enabled details, and duration remain spoken in the normal announcement sequence.