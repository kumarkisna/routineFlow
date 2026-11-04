---
name: Expo workspace module resolution
description: Resolve Metro failures when workspace-level configs cannot locate Expo installed in an artifact workspace.
---

In this pnpm workspace, Metro's workspace-level configuration may fail to resolve `expo/package.json` even when Expo is installed under the mobile artifact's own `node_modules`.

**Why:** Metro resolves Expo from a workspace-level config package, while pnpm keeps the app's Expo package linked inside the artifact workspace.

**How to apply:** For this exact missing-module error, verify the app-local Expo package resolves and export the artifact's `node_modules` directory in that artifact's dev command via `NODE_PATH`. Keep the setting scoped to the app workflow, then restart and confirm Metro bundles.
