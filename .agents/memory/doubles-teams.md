---
name: Doubles teams architecture
description: How teams, players, and bracket matches relate after the doubles refactor
---

# Doubles Teams Architecture

## The rule
`matchesTable.playerOneId`, `playerTwoId`, and `winnerId` store **team IDs** — not player IDs. Column names were kept intentionally to avoid rewriting `bracket.ts`.

## Why
PB&J is a pickleball doubles app. Players join individually; the host generates pairs (teams); the bracket runs team vs team.

## Key tables
- `teamsTable` — id, tournamentId, player1Id, player2Id, teamName, seed, createdAt
- `playersTable.teamId` — FK to teamsTable (set when teams are generated)

## Data flow
1. Players join → `playersTable` rows (teamId = null)
2. Host calls POST `/teams` → `teamsTable` rows created; player.teamId set
3. Host calls POST `/start` → teams seeded, `generateSingleEliminationBracket()` receives `{id: team.id, seed: i+1}[]`
4. Match completion → look up teams by playerOneId/playerTwoId, update all 4 players' ELO, add both losing-team players to open_play_pool

## How to apply
- Any code that uses match.playerOneId/playerTwoId must treat them as team IDs
- ELO is averaged per team, applied to each individual player
- Open play pool uses player IDs (both players of losing team added/removed together)
- Frontend: `getTeam(id)` looks up in `tournament.teams`, `displayName(teamId)` returns team name or "P1 & P2"
