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

Custom Expo Android library modules should define `android.defaultConfig.versionName` in their library `build.gradle`.

**Why:** Expo's module Gradle plugin reads the Android library's `defaultConfig.versionName` during project configuration; omitting it can stop autolinking before app compilation.

**How to apply:** When a Gradle log reports `android.defaultConfig.versionName is not defined` while configuring a local Expo module, add its module version to that module's Android `defaultConfig`.

For an EAS Android release profile, pin the same pnpm version used by the workspace when install policy restricts dependency build scripts.

**Why:** A mismatched EAS pnpm version can alter dependency installation behavior and block required packages such as `esbuild`, even when the local workspace succeeds.

**How to apply:** Keep the EAS profile's pnpm version aligned with the workspace package manager before troubleshooting dependency build failures.

Use notification channel settings to silence Android O+ foreground-service notifications; do not rely on `Notification.Builder.setSilent()`.

**Why:** The builder method is unavailable with the project's Android compile SDK, while channel importance, sound, and vibration settings already control alert behavior.

**How to apply:** For silent notifications, set low channel importance and disable sound/vibration on Android O+; use low priority for pre-Oreo devices.