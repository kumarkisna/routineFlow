---
name: Speech-gated routine timers
description: Timing and notification tradeoff when spoken step introductions must finish before countdowns begin.
---

When voice is enabled, each routine step's countdown begins only after its announcement ends. Do not pre-schedule later step timers or completion notifications based only on fixed step durations.

**Why:** Speech duration varies by device, title, and accessibility settings. Precomputed later deadlines would count down during speech and send early reminders, contrary to the user's explicit timing requirement. If the operating system suspends speech while locked, the next step may need to wait until the app resumes.

**How to apply:** On each step transition, wait for the speech completion callback before recording a countdown deadline; schedule only notifications whose deadline is known. Keep mute, pause, skip, and restart able to invalidate stale speech callbacks.