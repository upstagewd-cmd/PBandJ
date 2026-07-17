/**
 * Compute ELO change for winner and loser of a 1v1 match.
 * For doubles, pass in the *average* team rating as rA / rB.
 */
export function computeElo(
  winnerRating: number,
  loserRating: number,
  kFactor = 32
): { winnerDelta: number; loserDelta: number } {
  const expected = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const delta = Math.max(1, Math.round(kFactor * (1 - expected)));
  return { winnerDelta: delta, loserDelta: -delta };
}

export const INITIAL_ELO = 1200;
