---
name: Routine step details
description: Requirement and compatibility rule for multiple details on a routine step.
---

Each routine step keeps its existing detail and lets users add or remove additional detail entries on demand. The main detail and every additional detail have independent speech settings, defaulting to spoken. Older steps without per-detail settings remain spoken; an older saved per-step speech choice is honored when its details are first edited.

**Why:** The user clarified that speech must be selectable per individual detail, not as one switch for all details on a step. Preserving the legacy per-step setting avoids changing saved routines unexpectedly.

**How to apply:** Keep each detail's speech flag aligned with the ordered main/additional details through editing, copying, import, and export. Missing flags mean spoken. Turning one off omits only that detail; the step title, assigned skills, other enabled details, and duration remain spoken in the normal announcement sequence.

Attachment picker callbacks are asynchronous. When adding or removing a file while editing a step, update the latest draft by detail index and attachment ID instead of replacing it with a list captured before the picker opened.

**Why:** Returning from a device picker can happen after the editor has rerendered; replacing from an old prop snapshot can discard files already added to that detail.

**How to apply:** Append/remove attachments with functional state updates, and keep file groups aligned with the main detail and each additional detail through step update and routine save.

When a step detail has multiple images, tapping any image opens a swipeable viewer at that image. The slideshow includes only images attached to that one detail; it must not mix images from other details or steps.

**Why:** The user asked to browse multiple images as slides and clarified that the viewer starts from the image tapped and stays within that detail.

**How to apply:** Keep the image viewer scoped to the attachments passed for one detail. Leave document attachments in the existing open/share list.