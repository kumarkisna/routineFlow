---
name: Android backup imports
description: Reliable access to provider-backed files selected on Android.
---

Android content-provider file URIs may be inaccessible through Expo's legacy string-read path even when the document picker requests a cache copy. Prefer the Expo FileSystem native picker and its File text-reading API for native imports; keep browser imports on the browser-compatible picker path.

**Why:** An Android tablet backup import failed with a file-access IOException from the legacy FileSystem read, while the SDK's native file picker retains access through Android's content resolver.

**How to apply:** Keep the native picker/read path separate from web, preserve the existing size limit before reading, and report a clear recovery message if the selected provider still denies access.