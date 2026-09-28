---
name: Workspace package installs
description: Package additions in this pnpm workspace may rewrite the workspace settings file
---

Adding a dependency to a workspace package with pnpm can normalize the workspace settings YAML, removing explanatory security comments and changing catalog range formatting. Preserve the original settings and comments when adding packages; check the diff before finishing.

**Why:** A scoped dev dependency install unexpectedly rewrote the workspace-wide configuration rather than changing only the package manifest and lockfile. The package-management callback could not target a workspace package, so the scoped pnpm command was necessary.

**How to apply:** For future package installs, use a package-scoped command if the package-management callback cannot express the target. Restore unrelated workspace YAML edits and keep catalog specifications and lockfile consistent.