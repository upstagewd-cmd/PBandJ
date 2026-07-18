import { generateSingleEliminationBracket, type MatchSlot, type ByeStrategy } from "../../artifacts/api-server/src/lib/bracket";

function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function countRound(matches: MatchSlot[], round: number): number {
  return matches.filter((m) => m.round === round).length;
}

function validateBracket(n: number, strategy: ByeStrategy, iteration: number): void {
  const players = Array.from({ length: n }, (_, i) => ({ id: `team-${i + 1}`, seed: i + 1 }));
  const matches = generateSingleEliminationBracket(`tour-${n}-${strategy}-${iteration}`, players, {
    byeStrategy: strategy,
  });

  const bracketSize = nextPowerOf2(n);
  const expectedRounds = Math.log2(bracketSize);
  const expectedMatchCount = bracketSize - 1;

  assert(matches.length === expectedMatchCount, `[n=${n}, ${strategy}] expected ${expectedMatchCount} matches, got ${matches.length}`);

  const ids = new Set(matches.map((m) => m.id));
  assert(ids.size === matches.length, `[n=${n}, ${strategy}] duplicate match IDs found`);

  assert(countRound(matches, expectedRounds) === 1, `[n=${n}, ${strategy}] expected exactly one final in round ${expectedRounds}`);

  for (let round = 1; round <= expectedRounds; round++) {
    const expectedRoundCount = bracketSize / Math.pow(2, round);
    assert(
      countRound(matches, round) === expectedRoundCount,
      `[n=${n}, ${strategy}] round ${round} expected ${expectedRoundCount} matches`
    );
  }

  const playerIdSet = new Set(players.map((p) => p.id));
  const slottedPlayerIds = new Set<string>();

  for (const match of matches) {
    if (match.playerOneId) {
      assert(playerIdSet.has(match.playerOneId), `[n=${n}, ${strategy}] unknown playerOneId ${match.playerOneId}`);
      slottedPlayerIds.add(match.playerOneId);
    }
    if (match.playerTwoId) {
      assert(playerIdSet.has(match.playerTwoId), `[n=${n}, ${strategy}] unknown playerTwoId ${match.playerTwoId}`);
      slottedPlayerIds.add(match.playerTwoId);
    }
    if (match.winnerId) {
      assert(playerIdSet.has(match.winnerId), `[n=${n}, ${strategy}] unknown winnerId ${match.winnerId}`);
    }

    if (match.round < expectedRounds) {
      assert(!!match.nextWinnerMatchId, `[n=${n}, ${strategy}] non-final match missing nextWinnerMatchId`);
      assert(match.nextWinnerSlot === "one" || match.nextWinnerSlot === "two", `[n=${n}, ${strategy}] invalid nextWinnerSlot`);
      assert(ids.has(match.nextWinnerMatchId!), `[n=${n}, ${strategy}] nextWinnerMatchId does not exist`);
    } else {
      assert(match.nextWinnerMatchId === null, `[n=${n}, ${strategy}] final should not have nextWinnerMatchId`);
    }

    assert(
      ["pending", "active", "completed", "bye"].includes(match.status),
      `[n=${n}, ${strategy}] invalid status ${match.status}`
    );

    if (match.status === "active") {
      assert(!!match.playerOneId || !!match.playerTwoId, `[n=${n}, ${strategy}] active match has no players`);
    }
  }

  assert(slottedPlayerIds.size === n, `[n=${n}, ${strategy}] expected all ${n} teams to be slotted at least once`);

  const realByes = matches.filter((m) => m.isBye && !!m.winnerId);
  const expectedRealByes = bracketSize - n;
  assert(
    realByes.length === expectedRealByes,
    `[n=${n}, ${strategy}] expected ${expectedRealByes} real byes, got ${realByes.length}`
  );

  const activeOrCompleted = matches.filter((m) => m.status === "active" || m.status === "completed");
  assert(activeOrCompleted.length > 0, `[n=${n}, ${strategy}] expected at least one playable match`);
}

function runSweep(): void {
  const minTeams = 2;
  const maxTeams = 64;
  const randomIterationsPerCount = 25;

  let checks = 0;

  for (let n = minTeams; n <= maxTeams; n++) {
    validateBracket(n, "highestSeeded", 0);
    checks += 1;

    for (let i = 0; i < randomIterationsPerCount; i++) {
      validateBracket(n, "random", i);
      checks += 1;
    }
  }

  console.log(`Bracket sweep passed: ${checks} validations across team counts ${minTeams}-${maxTeams}.`);
}

runSweep();
