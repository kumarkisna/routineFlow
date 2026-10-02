---
name: Expo SDK 57 compatibility
description: Non-obvious SDK 57 configuration and Hermes compatibility checks.
---

Expo SDK 57 rejects the legacy top-level `splash` configuration. Preserve the splash appearance through the `expo-splash-screen` config plugin instead.

**Why:** Expo Doctor explicitly rejected the old configuration under SDK 57, despite the application still bundling.

**How to apply:** Check the SDK's configuration schema when editing splash settings; do not restore the older top-level example.

Early SDK 57 releases have a documented Hermes V1 memory regression; Expo Doctor requires Expo 57.0.9 or later.

**Why:** Runtime diagnostics identified this regression in the initial 57.0.0 installation. Successful TypeScript checks and browser rendering do not establish native-runtime compatibility.

**How to apply:** Use Expo's dependency alignment and Doctor checks when investigating native-only problems. Do not assume resolving their warnings proves an Android gesture problem fixed; native interaction needs separate verification.