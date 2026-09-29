---
name: Android overlay boundary
description: Why the current mobile build keeps system-level overlay work separate from the Expo-compatible app.
---

The mobile artifact now contains a native Android overlay service and bridge alongside the Expo-compatible in-app preview. The native service needs a custom Android build; the Replit container can typecheck the JS/API layers but does not have Java/Android tooling to compile the APK.

**Why:** Expo Go cannot load an always-on-top Android service or capture another app's screen, and native compilation cannot be verified in the current container without Java/Android tooling.

**How to apply:** Keep the API contract (`POST /api/analysis/chart`) reusable, use the native permission/service path for device builds, and keep the in-app screenshot picker as the Expo Go fallback.