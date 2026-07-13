import { randomUUID } from "crypto";

export type BracketType = "winner";

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
 * Generates a single-elimination bracket.
 *
 * Structure:
 *   wbRounds = log2(bracketSize) rounds
 *   Round 1: bracketSize/2 matches
 *   Each subsequent round halves the match count
 *   Final round: 1 match (the championship)
 *
 * Losers are eliminated immediately — no second-chance bracket.
 * Routing is embedded in each match record; completion logic is just
 * "follow the arrow": winner → nextWinnerMatchId/Slot.
 */
export function generateSingleEliminationBracket(
  tournamentId: string,
  players: PlayerSeed[]
): MatchSlot[] {
  const n = players.length;
  if (n < 2) return [];

  if (n === 6) {
    const sorted = [...players].sort((a, b) => a.seed - b.seed);
    const bracketSize = 8;
    const wbRounds = Math.log2(bracketSize);
    const wb: MatchSlot[][] = [[]];
    for (let r = 1; r <= wbRounds; r++) {
      const count = bracketSize / Math.pow(2, r);
      wb.push(Array.from({ length: count }, (_, i) => makeMatch(tournamentId, "winner", r, i + 1)));
    }

    const matchMap = new Map<string, MatchSlot>();
    for (const round of wb) for (const match of round) matchMap.set(match.id, match);

    const quarterFinals = wb[1];
    const semis = wb[2];
    const finals = wb[3];

    const [topSeed, secondSeed, thirdSeed, fourthSeed, fifthSeed, sixthSeed] = sorted.map((p) => p.id);
    quarterFinals[0].playerOneId = topSeed;
    quarterFinals[0].playerTwoId = fourthSeed;
    quarterFinals[0].status = "active";
    quarterFinals[1].playerOneId = secondSeed;
    quarterFinals[1].playerTwoId = thirdSeed;
    quarterFinals[1].status = "active";
    quarterFinals[2].playerOneId = fifthSeed;
    quarterFinals[2].playerTwoId = sixthSeed;
    quarterFinals[2].status = "active";

    semis[0].playerOneId = quarterFinals[0].id;
    semis[0].playerTwoId = quarterFinals[1].id;
    semis[0].status = "active";
    semis[1].playerOneId = null;
    semis[1].playerTwoId = null;
    semis[1].status = "bye";
    semis[1].isBye = true;
    semis[1].winnerId = topSeed;

    finals[0].playerOneId = semis[0].id;
    finals[0].playerTwoId = semis[1].id;
    finals[0].status = "active";

    for (let r = 1; r <= wbRounds; r++) {
      wb[r].forEach((match, i) => {
        const m = i + 1;
        if (r < wbRounds) {
          const nextM = Math.ceil(m / 2);
          match.nextWinnerMatchId = wb[r + 1][nextM - 1].id;
          match.nextWinnerSlot = m % 2 === 1 ? "one" : "two";
        }
      });
    }

    const allMatches: MatchSlot[] = [];
    for (let r = 1; r <= wbRounds; r++) allMatches.push(...wb[r]);

    for (const match of allMatches) {
      if (match.playerOneId && match.playerTwoId) {
        match.status = "active";
      } else if (match.playerOneId || match.playerTwoId) {
        applyBye(match, matchMap);
      }
    }

    return allMatches;
  }

  const bracketSize = Math.max(4, nextPowerOf2(n));
  const wbRounds = Math.log2(bracketSize);

  // ── Build match grid (1-indexed by round) ───────────────────────────────
  const wb: MatchSlot[][] = [[]];
  for (let r = 1; r <= wbRounds; r++) {
    const count = bracketSize / Math.pow(2, r);
    wb.push(
      Array.from({ length: count }, (_, i) =>
        makeMatch(tournamentId, "winner", r, i + 1)
      )
    );
  }

  // ── Winner routing ───────────────────────────────────────────────────────
  for (let r = 1; r <= wbRounds; r++) {
    wb[r].forEach((match, i) => {
      const m = i + 1; // 1-indexed match number
      if (r < wbRounds) {
        const nextM = Math.ceil(m / 2);
        match.nextWinnerMatchId = wb[r + 1][nextM - 1].id;
        match.nextWinnerSlot = m % 2 === 1 ? "one" : "two";
      }
      // Losers are eliminated — no nextLoserMatchId
    });
  }

  // ── Assign players to Round 1 ────────────────────────────────────────────
  const sorted = [...players].sort((a, b) => a.seed - b.seed);
  const wbR1 = wb[1];

  sorted.forEach((p, i) => {
    const matchIdx = Math.floor(i / 2);
    const slot = i % 2 === 0 ? "playerOneId" : "playerTwoId";
    if (matchIdx < wbR1.length) {
      wbR1[matchIdx][slot] = p.id;
    }
  });

  // ── Collect all matches ──────────────────────────────────────────────────
  const allMatches: MatchSlot[] = [];
  for (let r = 1; r <= wbRounds; r++) allMatches.push(...wb[r]);

  const matchMap = new Map(allMatches.map((m) => [m.id, m]));

  // ── Resolve real byes top-down ───────────────────────────────────────────
  for (let r = 1; r <= wbRounds; r++) {
    for (const match of wb[r]) {
      if (match.playerOneId && match.playerTwoId) {
        match.status = "active";
      } else if (match.playerOneId || match.playerTwoId) {
        applyBye(match, matchMap);
      }
      // Ghost matches (no players) handled in the pass below
    }
  }

  // ── Mark ghost matches (empty slots that will never receive a player) ────
  // Iteratively mark matches that have no players and no live upstream source.
  // "Live source" = a source match that is NOT itself a ghost bye (isBye && !winnerId).
  let anyChanged = true;
  while (anyChanged) {
    anyChanged = false;
    for (let r = 1; r <= wbRounds; r++) {
      for (const match of wb[r]) {
        if (match.isBye || match.playerOneId || match.playerTwoId) continue;
        // Check whether either slot can ever receive a player from upstream
        const willGetOne = allMatches.some(
          (m) =>
            m.nextWinnerMatchId === match.id &&
            m.nextWinnerSlot === "one" &&
            !(m.isBye && !m.winnerId)
        );
        const willGetTwo = allMatches.some(
          (m) =>
            m.nextWinnerMatchId === match.id &&
            m.nextWinnerSlot === "two" &&
            !(m.isBye && !m.winnerId)
        );
        if (!willGetOne && !willGetTwo) {
          // Ghost — mark as void bye so downstream cascadeBye detects it
          match.status = "bye";
          match.isBye = true;
          // winnerId stays null (no player to advance)
          anyChanged = true;
        }
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
    if (next.playerOneId && next.playerTwoId) {
      next.status = "active";
    } else if (next.playerOneId || next.playerTwoId) {
      cascadeBye(next, matchMap);
    }
  }
}

/**
 * Check if a match that has exactly one player should become a bye.
 * A match becomes a bye if neither possible source for the empty slot
 * can ever produce a player.
 */
function cascadeBye(match: MatchSlot, matchMap: Map<string, MatchSlot>) {
  const emptySlot = match.playerOneId ? "two" : "one";

  const sourceMatch = [...matchMap.values()].find(
    (m) =>
      m.nextWinnerMatchId === match.id && m.nextWinnerSlot === emptySlot
  );

  if (!sourceMatch || (sourceMatch.isBye && !sourceMatch.winnerId)) {
    applyBye(match, matchMap);
  }
}
