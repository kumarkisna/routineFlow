---
name: GitHub synchronization
description: The user wants project changes made at their instruction kept on GitHub.
---

After completing changes the user requested in this project, commit and push those changes to GitHub's `main` as part of the work. Preserve existing local configuration when merging, and verify the push succeeded. Do not push unrelated changes.

**Why:** The user wants the private standalone mobile app's code and changes kept in GitHub as well as Replit.

**How to apply:** For future code or documentation requests, inspect branch and working-tree status, sync with `origin/main`, complete and verify the requested changes, then commit and push to `main`. If a remote conflict or unrelated local change makes a safe push uncertain, stop and ask before overwriting or discarding anything.
