---
name: Attachment cleanup test isolation
description: Keep local attachment cleanup unit tests independent of Expo and React Native native module loading.
---

Keep the reference-scanning and orphan-selection logic free of top-level Expo FileSystem and AsyncStorage imports. Inject storage and filesystem adapters so it can run under the Node-based unit test suite.

**Why:** Importing native-facing React Native modules into the TypeScript Node test runner can fail during module transformation before the tests execute.

**How to apply:** Keep platform adapters in the React context or app entrypoint and pass them into the cleanup helper; use fake adapters in unit tests.
