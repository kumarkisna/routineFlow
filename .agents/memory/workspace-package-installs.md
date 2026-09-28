---
name: Workspace package installs
description: Package additions in this pnpm workspace may rewrite the workspace settings file
---

Adding a dependency to a workspace package with pnpm can normalize the workspace settings YAML, removing explanatory security comments and changing catalog range formatting. Preserve the original settings and comments when adding packages; check the diff before finishing.

**Why:** A scoped dev dependency install unexpectedly rewrote the workspace-wide configuration rather than changing only the package manifest and lockfile. The package-management callback could not target a workspace package, so the scoped pnpm command was necessary.

**How to apply:** For future package installs, use a package-scoped command if the package-management callback cannot express the target. Restore unrelated workspace YAML edits and keep catalog specifications and lockfile consistent.

Declared dev dependencies can be present in the pnpm store but missing their workspace-package links, causing `tsx: not found` and missing Node types even though the manifest and lockfile are correct. An offline frozen-lockfile install restored the links without changing tracked files.

**Why:** The package-management callback attempted a root-level add and could not accept a workspace filter, while no new dependency was actually needed.

**How to apply:** When declared packages are already cached but their links are missing, restore the lockfile's existing install rather than adding the same packages again.