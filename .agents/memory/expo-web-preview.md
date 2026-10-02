---
name: Expo web preview verification
description: Avoid false blank-screen diagnoses during cold preview startup.
---

A blank early Expo web screenshot after a dependency update or Metro restart does not necessarily mean the app is broken. Wait for actual visible UI, not merely bundle loading or attached DOM nodes.

**Why:** The screenshot tool captured an entirely white screen during startup, while waiting for visible navigation later showed the working app with normal geometry and scrollable forms.

**How to apply:** If a cold-start screenshot is blank without a runtime exception, verify a visible page control and inspect its ancestors before changing layout again. Browser scrolling does not establish that native Android emulator gestures work.