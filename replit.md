# PB&J

A mobile-first tournament bracket app — create a tournament, share a link, friends join, pick winners in real time. No accounts required.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/bracket-boss run dev` — run the frontend (port 18981)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + wouter + TanStack Query
- API: Express 5 + WebSocket (ws) for real-time sync
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/db/src/schema/` — Drizzle schema (tournaments, players, matches)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/bracket.ts` — Bracket generation logic
- `artifacts/api-server/src/lib/ws.ts` — WebSocket manager (broadcasts to tournament rooms)
- `artifacts/bracket-boss/src/` — React frontend

## Architecture decisions

- No user accounts — host token stored in localStorage, passed with privileged API calls
- Tournament IDs are short alphanumeric codes (e.g. `AB12CD`) for easy sharing
- WebSocket at `/ws?tournamentId=X` broadcasts full TournamentFull payload on every state change
- Bracket is generated on Start: players shuffled, seeded, and matched; byes auto-assigned for non-power-of-2 counts
- All bracket advancement happens server-side to keep state consistent across all clients

## Product

Create → Share link/QR code → Friends join by name → Host starts → Pick winners → Champion crowned. Supports 4–64 players with automatic byes.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After any OpenAPI spec change, run codegen before touching types
- WebSocket path `/ws` must stay registered in the Express HTTP server (not Vite)
- The `mergeParams: true` option on nested routers requires explicit `Request<Params>` typing for TypeScript to infer `req.params`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
