---
name: Native browser-storage guards
description: Avoid browser-only development helpers crashing in React Native.
---

Do not assume that `typeof window !== 'undefined'` means browser storage is available. React Native may define `window` without `window.localStorage`; development-only browser persistence helpers must feature-detect `localStorage` before reading it.

**Why:** Android startup failed in a development-only storage delay helper with a missing `getItem`, while the web app worked.

**How to apply:** Guard all `window.localStorage` access and add a regression test that simulates a native `window` object without `localStorage`.
