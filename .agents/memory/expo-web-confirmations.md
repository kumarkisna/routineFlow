---
name: Expo web confirmations
description: A reliability lesson for destructive confirmation in the Expo web preview
---

Use an in-app confirmation with explicit Cancel and Confirm controls for destructive actions that need to work in both Expo web and native. Do not rely only on a platform alert for those actions.

**Why:** Routine deletion previously depended on a platform alert and was reported as nonfunctional. After switching to an in-app confirmation, the web browser verified cancel, confirmed deletion, and persistence after reload.

**How to apply:** When adding another irreversible action, verify the confirmation is visible on web and await persistence before navigating away; retain an actionable error state if saving fails.