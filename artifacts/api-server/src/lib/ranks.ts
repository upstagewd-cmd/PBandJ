export interface Rank {
  title: string;
  emoji: string;
  minElo: number;
}

import { getRankTierForElo } from "./rank-config";

export interface Rank {
  title: string;
  emoji: string;
  minElo: number;
}

export async function getRank(elo: number): Promise<Rank> {
  const tier = await getRankTierForElo(elo);
  return {
    title: tier.title,
    emoji: tier.emoji,
    minElo: tier.minElo,
  };
}
