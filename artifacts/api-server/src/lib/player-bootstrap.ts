import { randomUUID } from "crypto";
import { clerkClient } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import { db, playersTable } from "@workspace/db";
import { getStartingEloForSkill } from "./settings";

export const USER_REGISTRY_TOURNAMENT_ID = "__user_registry__";

function fallbackNameFromEmail(email: string | null | undefined): string {
  if (!email) return "Player";
  const localPart = email.split("@")[0]?.trim();
  return localPart || "Player";
}

export async function ensureUserHasPlayerRecord(clerkUserId: string): Promise<void> {
  const [existing] = await db
    .select({ id: playersTable.id })
    .from(playersTable)
    .where(
      and(
        eq(playersTable.clerkUserId, clerkUserId),
        eq(playersTable.tournamentId, USER_REGISTRY_TOURNAMENT_ID)
      )
    )
    .limit(1);

  if (existing) return;

  const user = await clerkClient.users.getUser(clerkUserId);
  const firstName =
    user.firstName?.trim() ||
    user.username?.trim() ||
    fallbackNameFromEmail(user.primaryEmailAddress?.emailAddress);
  const lastName = user.lastName?.trim() || "User";
  const defaultElo = await getStartingEloForSkill("beginner");

  await db.insert(playersTable).values({
    id: randomUUID(),
    tournamentId: USER_REGISTRY_TOURNAMENT_ID,
    firstName,
    lastName,
    partnerName: null,
    teamName: null,
    playerToken: null,
    avatarUrl: user.imageUrl ?? null,
    clerkUserId,
    skillLevel: "beginner",
    eloRating: defaultElo,
    seed: 0,
    teamId: null,
  });
}