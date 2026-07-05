---
name: ELO + Open Play Pool architecture
description: How ELO ratings are updated and how players flow into the open play pool after bracket elimination.
---

## ELO
- K=32, initial rating=1200, floor=800
- Updated in `artifacts/api-server/src/routes/matches.ts` on every non-bye match completion
- For doubles/teams, uses average team ELO as the input rating
- Lib: `artifacts/api-server/src/lib/elo.ts` (computeElo), `artifacts/api-server/src/lib/ranks.ts` (getRank)

## Ranks (minElo thresholds)
New Seed (0) → Rising Player (1300) → Battle Tested (1450) → Court General (1600) → Lion Heart (1800) → Kingdom Competitor (2000)

## Open Play Pool
- DB table: `open_play_pool` (tournamentId, playerId, status: available/playing)
- Players are auto-added to the pool when they lose a LB elimination match (`bracket === "loser"` with no `nextLoserMatchId`) or lose in GF/GF Reset
- Route: `artifacts/api-server/src/routes/open-play.ts`
- ELO is also updated when open play matches are logged via POST `/tournaments/:id/open-play/matches`

## Auto Team Name
Server-side in `players.ts` POST handler: if no `teamName` provided, generates "Phil C. + Noah R." format using last-name initial. Frontend shows a live preview as user types.
