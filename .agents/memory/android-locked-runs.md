---
name: Locked-run platform behavior
description: Platform-specific behavior and verification limits for routine and playlist playback while the phone is locked.
---

Android keeps an active routine or playlist run progressing while locked with a local foreground service and partial wake lock. Stop the service on pause, exit, rating prompts, and completion; keep it running across automatic playlist routine transitions. iOS uses alert-and-resume rather than attempting to advance while suspended.

**Why:** The product behavior is intentionally different by platform. Expo Go does not include the app's local native Android module, so it cannot validate locked-screen continuation.

**How to apply:** Verify Android lock-screen playback with an installed native development build, not Expo Go. Keep speech-gated timing intact: schedule reminders for the active step only after its announcement finishes, then update for the next step dynamically.
