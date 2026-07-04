import { randomUUID } from "crypto";

export type BracketType = "winner" | "loser" | "grand_finals" | "grand_finals_reset";

export interface MatchSlot {
  id: string;
  tournamentId: string;
  round: number;
  matchNumber: number;
  bracket: BracketType;
  playerOneId: string | null;
  playerTwoId: string | null;
  winnerId: string | null;
  scoreOne: number | null;
  scoreTwo: number | null;
  status: string;
  isBye: boolean;
  nextWinnerMatchId: string | null;
  nextWinnerSlot: string | null;
  nextLoserMatchId: string | null;
  nextLoserSlot: string | null;
}

interface PlayerSeed {
  id: string;
  seed: number;
}

function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function makeMatch(
  tournamentId: string,
  bracket: BracketType,
  round: number,
  matchNumber: number
): MatchSlot {
  return {
    id: randomUUID(),
    tournamentId,
    bracket,
    round,
    matchNumber,
    playerOneId: null,
    playerTwoId: null,
    winnerId: null,
    scoreOne: null,
    scoreTwo: null,
    status: "pending",
    isBye: false,
    nextWinnerMatchId: null,
    nextWinnerSlot: null,
    nextLoserMatchId: null,
    nextLoserSlot: null,
  };
}

/**
 * Generates a full double-elimination bracket.
 *
 * Structure:
 *   Winner Bracket:  wbRounds = log2(bracketSize) rounds
 *   Loser Bracket:   lbRounds = 2 * (wbRounds - 1) rounds
 *   Grand Finals:    1 match  (WB champion vs LB champion)
 *   GF Reset:        1 match  (if-necessary — activates only if LB side wins GF)
 *
 * Routing is embedded in each match record so completion logic is just
 * "follow the arrow": winner → nextWinnerMatchId/Slot, loser → nextLoserMatchId/Slot.
 */
export function generateDoubleEliminationBracket(
  tournamentId: string,
  players: PlayerSeed[]
): MatchSlot[] {
  const n = players.length;
  if (n < 2) return [];

  const bracketSize = Math.max(4, nextPowerOf2(n));
  const wbRounds = Math.log2(bracketSize);

  // ── Build match grids (1-indexed by round) ──────────────────────────────

  // wb[r] = array of WB matches for round r (index 0 = match 1)
  const wb: MatchSlot[][] = [[]];
  for (let r = 1; r <= wbRounds; r++) {
    const count = bracketSize / Math.pow(2, r);
    wb.push(Array.from({ length: count }, (_, i) => makeMatch(tournamentId, "winner", r, i + 1)));
  }

  // lb[r] = array of LB matches for LB round r
  // LB round match count = bracketSize / 2^(ceil(r/2) + 1)
  const lbRounds = 2 * (wbRounds - 1);
  const lb: MatchSlot[][] = [[]];
  for (let r = 1; r <= lbRounds; r++) {
    const count = bracketSize / Math.pow(2, Math.ceil(r / 2) + 1);
    lb.push(Array.from({ length: count }, (_, i) => makeMatch(tournamentId, "loser", r, i + 1)));
  }

  const gf = makeMatch(tournamentId, "grand_finals", 1, 1);
  const gfReset = makeMatch(tournamentId, "grand_finals_reset", 1, 1);

  // ── WB routing ──────────────────────────────────────────────────────────

  for (let r = 1; r <= wbRounds; r++) {
    wb[r].forEach((match, i) => {
      const m = i + 1; // 1-indexed match number

      // Winner routing
      if (r === wbRounds) {
        // WB Finals winner → Grand Finals slot 1
        match.nextWinnerMatchId = gf.id;
        match.nextWinnerSlot = "one";
      } else {
        const nextM = Math.ceil(m / 2);
        match.nextWinnerMatchId = wb[r + 1][nextM - 1].id;
        match.nextWinnerSlot = m % 2 === 1 ? "one" : "two";
      }

      // Loser routing
      if (r === 1) {
        // WB R1 loser → LB R1, paired matches
        const lbM = Math.ceil(m / 2);
        match.nextLoserMatchId = lb[1][lbM - 1].id;
        match.nextLoserSlot = m % 2 === 1 ? "one" : "two";
      } else if (r < wbRounds) {
        // WB Rk (2≤k<finals) loser → LB R(2k-2), same match number, slot two
        const lbR = 2 * r - 2;
        match.nextLoserMatchId = lb[lbR][m - 1].id;
        match.nextLoserSlot = "two";
      } else {
        // WB Finals loser → LB Finals (last LB round), slot two
        match.nextLoserMatchId = lb[lbRounds][0].id;
        match.nextLoserSlot = "two";
      }
    });
  }

  // ── LB routing ──────────────────────────────────────────────────────────

  for (let r = 1; r <= lbRounds; r++) {
    lb[r].forEach((match, i) => {
      const m = i + 1;
      if (r === lbRounds) {
        // LB Finals winner → Grand Finals slot 2
        match.nextWinnerMatchId = gf.id;
        match.nextWinnerSlot = "two";
      } else if (r % 2 === 1) {
        // Odd (pure LB) round: same match count in next round → same match number, slot one
        match.nextWinnerMatchId = lb[r + 1][m - 1].id;
        match.nextWinnerSlot = "one";
      } else {
        // Even (feeder) round: next round has half the matches
        const nextM = Math.ceil(m / 2);
        match.nextWinnerMatchId = lb[r + 1][nextM - 1].id;
        match.nextWinnerSlot = m % 2 === 1 ? "one" : "two";
      }
      // LB losers are eliminated — no nextLoserMatchId
    });
  }

  // GF: routing is handled via bracket type in match-completion logic
  // GF Reset: same

  // ── Assign players to WB R1 ─────────────────────────────────────────────

  const sorted = [...players].sort((a, b) => a.seed - b.seed);
  const wbR1 = wb[1];

  sorted.forEach((p, i) => {
    const matchIdx = Math.floor(i / 2);
    const slot = i % 2 === 0 ? "playerOneId" : "playerTwoId";
    if (matchIdx < wbR1.length) {
      wbR1[matchIdx][slot] = p.id;
    }
  });

  // ── Collect all matches into a flat list ────────────────────────────────

  const allMatches: MatchSlot[] = [];
  for (let r = 1; r <= wbRounds; r++) allMatches.push(...wb[r]);
  for (let r = 1; r <= lbRounds; r++) allMatches.push(...lb[r]);
  allMatches.push(gf, gfReset);

  const matchMap = new Map(allMatches.map((m) => [m.id, m]));

  // ── Process WB R1: resolve byes immediately ──────────────────────────────
  //    A bye match has exactly one player. A ghost match has zero.
  //    Byes auto-advance their winner; no loser is dropped to LB.
  //    We process rounds in order so cascades resolve top-down.

  for (let r = 1; r <= wbRounds; r++) {
    for (const match of wb[r]) {
      if (match.playerOneId && match.playerTwoId) {
        match.status = "active";
      } else if (match.playerOneId && !match.playerTwoId) {
        applyBye(match, matchMap);
      } else if (!match.playerOneId && !match.playerTwoId) {
        // Ghost match — stays pending; downstream matches will resolve on their own
        // when the sibling branch eventually advances
      }
    }
  }

  // Process LB top-down for any cascaded single-player matches
  for (let r = 1; r <= lbRounds; r++) {
    for (const match of lb[r]) {
      if (match.playerOneId && match.playerTwoId) {
        match.status = "active";
      } else if (match.playerOneId && !match.playerTwoId) {
        applyBye(match, matchMap);
      }
    }
  }

  return allMatches;
}

/**
 * Mark a match as a bye, set the winner, and advance them to the next match.
 */
function applyBye(match: MatchSlot, matchMap: Map<string, MatchSlot>) {
  match.status = "bye";
  match.isBye = true;
  match.winnerId = match.playerOneId ?? match.playerTwoId;
  if (!match.winnerId) return;

  if (match.nextWinnerMatchId) {
    const next = matchMap.get(match.nextWinnerMatchId)!;
    if (match.nextWinnerSlot === "one") {
      next.playerOneId = match.winnerId;
    } else {
      next.playerTwoId = match.winnerId;
    }
    // Activate the next match if both slots now filled
    if (next.playerOneId && next.playerTwoId) {
      next.status = "active";
    } else if (next.playerOneId || next.playerTwoId) {
      // One slot filled; cascade bye if no one else will fill the other slot
      cascadeBye(next, matchMap);
    }
  }
}

/**
 * Check if a match that has exactly one player should become a bye.
 * A match becomes a bye if neither of the possible sources for the empty slot
 * can ever produce a player (the source match is itself a ghost or bye with no winner).
 */
function cascadeBye(match: MatchSlot, matchMap: Map<string, MatchSlot>) {
  const emptySlot = match.playerOneId ? "two" : "one";

  // Find which match routes into this match's empty slot
  const sourceMatch = [...matchMap.values()].find(
    (m) =>
      (m.nextWinnerMatchId === match.id && m.nextWinnerSlot === emptySlot) ||
      (m.nextLoserMatchId === match.id && m.nextLoserSlot === emptySlot)
  );

  if (!sourceMatch || (sourceMatch.isBye && !sourceMatch.winnerId)) {
    applyBye(match, matchMap);
  }
}
