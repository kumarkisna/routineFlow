---
name: Expo web checkbox assertions
description: Avoid assuming native checked accessibility state is exposed by the Expo web preview
---

Do not assume a React Native checkbox's accessibility checked state becomes a DOM `aria-checked` attribute in the installed Expo web stack.

**Why:** The export-history control changed its actual export behavior correctly in browser testing while its checked attribute remained absent. Testing that attribute alone incorrectly rejected a working restore/export flow.

**How to apply:** Transfer regression tests should assert downloaded JSON includes the expected history, rather than use DOM checked state as a proxy. Treat missing checked-state accessibility as a separate user-facing accessibility issue, not a reason to weaken file-content assertions.