---
name: Expo notification versions
description: Compatibility rule for adding local notifications to Expo artifacts.
---

Use the Expo SDK-compatible major version of `expo-notifications`, and verify it with the artifact's Expo install check before building.

**Why:** Expo Doctor rejects notification packages from a different SDK generation and native builds can otherwise contain duplicate or incompatible Expo modules.

**How to apply:** Read the installed Expo version from the artifact package, add the matching notification version, then run `CI=1 pnpm exec expo install --check` from that artifact directory.

Expo's compatibility check may briefly request newly released SDK patch versions that the package mirror still blocks under its release-maturity window. Do not bypass that window or exclude packages just to silence the check; retain the available SDK-matched versions and retry after they mature.

**Why:** A just-published Expo patch was reported as the expected version but rejected by the package mirror, while the existing aligned app successfully type-checked and bundled.

**How to apply:** If `expo install --fix` fails with a minimum-release-age or maturity error, keep the current lockfile versions, record the compatibility-check warning, and retry once the mirror allows the requested patch.

When using only local reminders on Android Expo Go, avoid importing the `expo-notifications` package root; import only the local-notification entrypoints. The package root eagerly loads remote push-token modules.

**Why:** Android Expo Go no longer supports remote push notifications, and the push-token module throws during route loading even when the app never requests a push token. This can make a timer screen appear to hang before rendering.

**How to apply:** If adding notification use to an Expo Go screen, inspect the import graph for remote push modules. Keep local scheduling, permissions, and foreground handlers separate from push registration; preserve reminders rather than disabling them.

On the current Android Expo Go runtime, avoid calling `setNotificationChannelAsync` or `setNotificationChannelGroupAsync`; leave the notification trigger's `channelId` unset so Expo can use its native fallback channel.

**Why:** Both JS channel-manager calls failed on-device because the native `NotificationsChannelsProvider` was missing, while Expo's notification presenter creates a high-importance fallback channel when no channel ID is requested.

**How to apply:** If a future feature needs custom channel settings, verify the provider exists in the target native client first. Keep schedule creation on the fallback path in Expo Go.