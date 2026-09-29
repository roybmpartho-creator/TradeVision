# Overlay Trading Assistant

A professional mobile trading companion that sends chart screenshots to a secure backend and returns fast, validated next-candle signals.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/overlay-trading-assistant run dev` — run the Expo mobile app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required secret: `GEMINI_API_KEY` — server-side Gemini chart analysis

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/overlay-trading-assistant/app/(tabs)/index.tsx` — mobile signal desk, scan flow, local signal history, and overlay preview state machine
- `artifacts/api-server/src/routes/analysis.ts` — server-side chart analysis endpoint and strict response validation
- `lib/api-spec/openapi.yaml` — source-of-truth contract for chart analysis
- `artifacts/overlay-trading-assistant/constants/colors.ts` — shared dark trading palette for the mobile surface

## Architecture decisions

- The Gemini key is only read by the API server; the mobile client submits screenshot data and receives a validated signal object.
- The analysis prompt is kept server-side and requests JSON-only output so the backend can reject malformed model responses.
- Signal history is persisted locally with AsyncStorage for a fast mobile-first dashboard without requiring user accounts.
- The current Expo-compatible build provides an in-app overlay preview; system-level cross-app overlay and MediaProjection capture are tracked separately because they require native Android capabilities.

## Product

- Premium dark signal desk with live readiness state
- Chart screenshot selection and backend-powered RED/GREEN next-candle analysis
- Floating overlay preview with idle, analyzing, and result states
- Recent signal history with asset, timeframe, confidence, timestamp, and reason

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The API server requires `GEMINI_API_KEY` and should never expose it to the Expo bundle.
- A true cross-app Android overlay requires a native development build and MediaProjection; Expo Go can preview the dashboard and in-app overlay only.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
