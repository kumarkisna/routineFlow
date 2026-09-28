---
name: Browser persistence fixtures
description: Prevent browser test setup from overwriting state being tested after reload
---

When a browser test seeds storage through an initialization script, guard the seed so it runs only when the test context has no stored data. Initialization scripts execute on each navigation, including reload.

**Why:** An unguarded fixture can overwrite a successful save just before the app hydrates, causing a false persistence failure.

**How to apply:** For reload-based persistence tests, use a fresh browser context per scenario and seed only if the application's storage key is absent. Check both the reloaded UI and persisted storage.