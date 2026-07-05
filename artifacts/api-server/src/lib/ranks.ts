export interface Rank {
  title: string;
  emoji: string;
  minElo: number;
}

export const RANKS: Rank[] = [
  { title: "New Seed",          emoji: "🌱", minElo: 0    },
  { title: "Rising Player",     emoji: "🔥", minElo: 1300 },
  { title: "Battle Tested",     emoji: "⚔️", minElo: 1450 },
  { title: "Court General",     emoji: "🏛️", minElo: 1600 },
  { title: "Lion Heart",        emoji: "🦁", minElo: 1800 },
  { title: "Kingdom Competitor",emoji: "👑", minElo: 2000 },
];

export function getRank(elo: number): Rank {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (elo >= RANKS[i].minElo) return RANKS[i];
  }
  return RANKS[0];
}
