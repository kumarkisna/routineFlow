---
name: Expo web preview verification
description: Avoid false blank-screen diagnoses during cold web or native preview startup.
---

A blank early Expo web screenshot after a dependency update or Metro restart does not necessarily mean the app is broken. Wait for actual visible UI, not merely bundle loading or attached DOM nodes.

**Why:** The screenshot tool captured an entirely white screen during startup, while waiting for visible navigation later showed the working app with normal geometry and scrollable forms.

**How to apply:** If a cold-start screenshot is blank without a runtime exception, verify a visible page control and inspect its ancestors before changing layout again. Browser scrolling does not establish that native Android emulator gestures work.

Web verification does not warm the separate Android bundle after dependency changes. An initial Android build can take several minutes in this workspace.

**Why:** After compatible Expo patch updates, the first Android bundle request exceeded a normal request timeout while Metro was still compiling; a later request completed successfully.

**How to apply:** Check Android-specific compilation progress and wait for its bundle to be served before repeatedly restarting or editing the app's root layout. Successful compilation still does not verify the emulator's display or touch gestures.

Cold Metro startup itself can exceed a short workflow readiness allowance, before any port opens. An auxiliary React Native DevTools installation error does not necessarily stop Metro.

**Why:** Standard launch attempts timed out, but a longer readiness allowance let the same configuration start and serve the application. Metro continued despite the debugger shell’s missing shared-library error.

**How to apply:** Distinguish slow startup progress from an application exception before reinstalling packages or changing root rendering. Never treat successful Metro startup or a browser check as proof that Android’s black screen is fixed.