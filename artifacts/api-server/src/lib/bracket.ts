import { randomUUID } from "crypto";
import { Player } from "@workspace/db";

export interface MatchSlot {
  id: string;
  tournamentId: string;
  round: number;
  matchNumber: number;
  playerOneId: string | null;
  playerTwoId: string | null;
  winnerId: string | null;
  scoreOne: number | null;
  scoreTwo: number | null;
  status: string;
  isBye: boolean;
}

export function generateBracket(tournamentId: string, players: Player[]): MatchSlot[] {
  const n = players.length;
  if (n < 2) return [];

  // Find next power of 2
  let bracketSize = 1;
  while (bracketSize < n) bracketSize *= 2;

  const totalRounds = Math.log2(bracketSize);
  const matches: MatchSlot[] = [];

  // Create first round matches with byes
  const firstRoundMatchCount = bracketSize / 2;

  for (let i = 0; i < firstRoundMatchCount; i++) {
    const p1Index = i * 2;
    const p2Index = i * 2 + 1;
    const p1 = players[p1Index] ?? null;
    const p2 = players[p2Index] ?? null;

    const isBye = p1 !== null && p2 === null;

    matches.push({
      id: randomUUID(),
      tournamentId,
      round: 1,
      matchNumber: i + 1,
      playerOneId: p1?.id ?? null,
      playerTwoId: p2?.id ?? null,
      winnerId: isBye ? (p1?.id ?? null) : null,
      scoreOne: null,
      scoreTwo: null,
      status: isBye ? "bye" : (p1 !== null && p2 !== null ? "active" : "pending"),
      isBye,
    });
  }

  // Create subsequent round match stubs
  for (let round = 2; round <= totalRounds; round++) {
    const matchCount = bracketSize / Math.pow(2, round);
    for (let i = 0; i < matchCount; i++) {
      matches.push({
        id: randomUUID(),
        tournamentId,
        round,
        matchNumber: i + 1,
        playerOneId: null,
        playerTwoId: null,
        winnerId: null,
        scoreOne: null,
        scoreTwo: null,
        status: "pending",
        isBye: false,
      });
    }
  }

  return matches;
}

export function advanceWinner(
  matches: MatchSlot[],
  completedMatch: MatchSlot
): MatchSlot[] {
  const updatedMatches = [...matches];
  const winner = completedMatch.winnerId;
  if (!winner) return updatedMatches;

  const currentRound = completedMatch.round;
  const currentMatchNum = completedMatch.matchNumber;
  const nextRound = currentRound + 1;

  const nextMatchNumber = Math.ceil(currentMatchNum / 2);
  const isPlayerOne = currentMatchNum % 2 === 1;

  const nextMatch = updatedMatches.find(
    (m) => m.round === nextRound && m.matchNumber === nextMatchNumber
  );

  if (!nextMatch) return updatedMatches;

  if (isPlayerOne) {
    nextMatch.playerOneId = winner;
  } else {
    nextMatch.playerTwoId = winner;
  }

  if (nextMatch.playerOneId && nextMatch.playerTwoId) {
    nextMatch.status = "active";
  } else if (nextMatch.playerOneId || nextMatch.playerTwoId) {
    // Still waiting for other player - check if it can be a bye
    const siblingMatchNum = isPlayerOne ? currentMatchNum + 1 : currentMatchNum - 1;
    const siblingMatch = updatedMatches.find(
      (m) => m.round === currentRound && m.matchNumber === siblingMatchNum
    );
    if (!siblingMatch || siblingMatch.status === "bye" || siblingMatch.status === "completed") {
      // Sibling is done, this becomes active or bye
      if (!nextMatch.playerOneId || !nextMatch.playerTwoId) {
        nextMatch.status = "bye";
        nextMatch.isBye = true;
        nextMatch.winnerId = nextMatch.playerOneId ?? nextMatch.playerTwoId;
      }
    }
  }

  return updatedMatches;
}
