---
name: Expo appearance API compatibility
description: Native color-scheme reset semantics in the installed React Native generation.
---

In React Native 0.86, resetting an app-specific appearance override uses `Appearance.setColorScheme('unspecified')`, not `null`.

**Why:** Older examples accept null, but this generation's native API and TypeScript signature changed to an explicit unspecified value. Casting null to bypass the error would hide an actual API incompatibility.

**How to apply:** Check the installed Appearance declaration and implementation before changing native light/dark handling. Use the supported reset value rather than copying older examples or applying a type cast.