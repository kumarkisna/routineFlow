# Routine Flow

Routine Flow helps people save repeatable routines and move through them one small step at a time.

## Run & Operate

- `pnpm --filter @workspace/routine-flow run dev` — run the Expo mobile app
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/routine-flow run typecheck` — check the mobile app
- The first mobile build is frontend-only and stores routines and daily completion locally with AsyncStorage.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Expo SDK 57, Expo Router, React Native
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/routine-flow/app/(tabs)/index.tsx` — today screen and routine library
- `artifacts/routine-flow/app/routine/[id].tsx` — routine run screen
- `artifacts/routine-flow/app/new-routine.tsx` — create routine flow
- `artifacts/routine-flow/context/RoutineContext.tsx` — local routine and daily progress state
- `artifacts/routine-flow/constants/colors.ts` — mobile theme tokens

## Architecture decisions

- Routine data is local-first with AsyncStorage so the core loop works offline and does not require account setup.
- Completion is tracked per routine step and calendar day, allowing progress to reset naturally without losing the routine library.
- The main app uses a tab-rooted today screen with stack-pushed creation and routine-run screens for minimal navigation chrome.

## Product

- Ships with Morning Reset, Deep Work, and Evening Wind-down starter routines.
- Users can create routines, add and remove steps, run any routine, mark individual steps complete, mark all complete, and reset today’s progress.

## User preferences

No additional preferences recorded.

## Gotchas

- Use the managed Expo workflow for previews; the dev server needs its injected PORT and Replit Expo environment.
- Expo’s React Native DevTools installer may log a missing system GLib library in this container; Metro still starts and the app preview works.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
