---
name: Android overlay boundary
description: Why the current mobile build keeps system-level overlay work separate from the Expo-compatible app.
---

The Expo-compatible mobile artifact intentionally keeps the floating control as an in-app preview. A true control above other apps needs Android `SYSTEM_ALERT_WINDOW` plus MediaProjection and therefore a native development build.

**Why:** Expo Go cannot register an always-on-top Android service or capture another app's screen. Presenting the preview as a system overlay would misrepresent the current capability.

**How to apply:** Keep the API contract (`POST /api/analysis/chart`) reusable, and implement the service, permission education, and MediaProjection capture in a native Android follow-up rather than weakening the secure backend boundary.