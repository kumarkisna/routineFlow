---
name: Android PDF printing
description: Work around Android rejecting Expo Print-generated file URLs in Expo Sharing.
---

On Android, open the native print sheet with `Print.printAsync({ html })` for PDF output instead of sharing the URI returned by `Print.printToFileAsync`. The Android print sheet allows printing or saving as PDF. Keep file-sharing flows for platforms where they work as intended.

**Why:** A Samsung Android tablet rejected an Expo Print-generated PDF URL with Expo Sharing's “Not allowed to read file under given URL” error.

**How to apply:** Use the native print path for Android in each PDF export surface; do not pass the Expo Print cache URI to `Sharing.shareAsync` on Android.
