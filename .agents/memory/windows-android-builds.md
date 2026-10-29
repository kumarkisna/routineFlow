---
name: Windows Android builds
description: Windows pnpm layout, Android Studio Java selection, and Expo release bundling behavior.
---

For this Expo workspace's Windows native build, a hoisted pnpm install keeps CMake/Ninja paths short, but Metro configuration may resolve from the repository root while Expo is linked under the app package. Setting the Windows user `NODE_PATH` to both the app and repository `node_modules` directories, then restarting Android Studio, lets release bundling resolve `expo/package.json`. A temporary PowerShell-only variable does not reach Gradle tasks launched by an already-running Android Studio process.

**Why:** The isolated pnpm layout produced Ninja's long-path failure; the hoisted layout then caused `:app:createBundleReleaseJsAndAssets` to fail on `Cannot find module 'expo/package.json'`.

**How to apply:** On Windows builds, keep `.npmrc` `node-linker=hoisted`, configure Android Studio's Gradle JVM criteria to Java 17, and set `NODE_PATH` at user scope before running `:app:assembleRelease`. Debug APKs need Metro; use a release APK for an offline, standalone install.
