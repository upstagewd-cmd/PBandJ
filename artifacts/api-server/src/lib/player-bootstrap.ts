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
    .select({
      id: playersTable.id,
      firstName: playersTable.firstName,
      lastName: playersTable.lastName,
      avatarUrl: playersTable.avatarUrl,
    })
    .from(playersTable)
    .where(
      and(
        eq(playersTable.clerkUserId, clerkUserId),
        eq(playersTable.tournamentId, USER_REGISTRY_TOURNAMENT_ID)
      )
    )
    .limit(1);

  const user = await clerkClient.users.getUser(clerkUserId);
  const firstName =
    user.firstName?.trim() ||
    user.username?.trim() ||
    fallbackNameFromEmail(user.primaryEmailAddress?.emailAddress);
  const lastName = user.lastName?.trim() || "User";
  const avatarUrl = user.imageUrl ?? null;

  if (existing) {
    const needsIdentityUpdate =
      existing.firstName !== firstName ||
      existing.lastName !== lastName ||
      (existing.avatarUrl ?? null) !== avatarUrl;

    if (needsIdentityUpdate) {
      await db
        .update(playersTable)
        .set({ firstName, lastName, avatarUrl })
        .where(eq(playersTable.id, existing.id));
    }

    // Keep avatar consistent across all rows for this signed-in identity.
    if ((existing.avatarUrl ?? null) !== avatarUrl) {
      await db
        .update(playersTable)
        .set({ avatarUrl })
        .where(eq(playersTable.clerkUserId, clerkUserId));
    }

    return;
  }

  const defaultElo = await getStartingEloForSkill("beginner");

  await db.insert(playersTable).values({
    id: randomUUID(),
    tournamentId: USER_REGISTRY_TOURNAMENT_ID,
    firstName,
    lastName,
    partnerName: null,
    teamName: null,
    playerToken: null,
    avatarUrl,
    clerkUserId,
    skillLevel: "beginner",
    eloRating: defaultElo,
    seed: 0,
    teamId: null,
  });
}