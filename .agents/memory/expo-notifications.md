---
name: Expo notification versions
description: Compatibility rule for adding local notifications to Expo artifacts.
---

Use the Expo SDK-compatible major version of `expo-notifications`, and verify it with the artifact's Expo install check before building.

**Why:** Expo Doctor rejects notification packages from a different SDK generation and native builds can otherwise contain duplicate or incompatible Expo modules.

**How to apply:** Read the installed Expo version from the artifact package, add the matching notification version, then run `CI=1 pnpm exec expo install --check` from that artifact directory.

Expo's compatibility check may briefly request newly released SDK patch versions that the package mirror still blocks under its release-maturity window. Do not bypass that window or exclude packages just to silence the check; retain the available SDK-matched versions and retry after they mature.

**Why:** A just-published Expo patch was reported as the expected version but rejected by the package mirror, while the existing aligned app successfully type-checked and bundled.

**How to apply:** If `expo install --fix` fails with a minimum-release-age or maturity error, keep the current lockfile versions, record the compatibility-check warning, and retry once the mirror allows the requested patch.