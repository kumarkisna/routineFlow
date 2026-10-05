---
name: Android backup files
description: Reliable local backup reads and saves through Android's document provider.
---

Android content-provider file URIs may be inaccessible through Expo's legacy string-read path even when the document picker requests a cache copy. Prefer Expo FileSystem's native file picker and File text-reading API for native imports.

For local exports, use the system folder picker, then create and write the JSON backup in the selected directory. `Sharing.shareAsync` opens the app chooser; it is for sharing, not direct local saving. Keep a separate share action if users need both choices.

**Why:** On the Android tablet, legacy reads failed with a file-access IOException, and the existing export flow only offered Android's app chooser instead of saving locally.

**How to apply:** Keep native and web paths separate: use the browser picker/download on web; use Expo FileSystem's file picker for Android imports and folder picker for Android exports. Preserve the existing size limit and treat folder-picker cancellation as a normal cancel.