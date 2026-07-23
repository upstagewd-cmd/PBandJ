import { randomUUID } from "crypto";
import { clerkClient } from "@clerk/express";
import { and, eq, sql } from "drizzle-orm";
import { db, playersTable } from "@workspace/db";
import { getStartingEloForSkill } from "./settings";

export const USER_REGISTRY_TOURNAMENT_ID = "__user_registry__";

function fallbackNameFromEmail(email: string | null | undefined): string {
  if (!email) return "Player";
  const localPart = email.split("@")[0]?.trim();
  return localPart || "Player";
}

export async function ensureUserHasPlayerRecord(clerkUserId: string): Promise<void> {
  const user = await clerkClient.users.getUser(clerkUserId);
  const firstName =
    user.firstName?.trim() ||
    user.username?.trim() ||
    fallbackNameFromEmail(user.primaryEmailAddress?.emailAddress);
  const lastName = user.lastName?.trim() || "User";
  const avatarUrl = user.imageUrl ?? null;
  const defaultElo = await getStartingEloForSkill("beginner");

  await db.transaction(async (tx) => {
    // New users often trigger several authenticated API calls at once.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${clerkUserId}))`);

    const [existing] = await tx
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

    if (existing) {
      const needsIdentityUpdate =
        existing.firstName !== firstName ||
        existing.lastName !== lastName ||
        (existing.avatarUrl ?? null) !== avatarUrl;

      if (needsIdentityUpdate) {
        await tx
          .update(playersTable)
          .set({ firstName, lastName, avatarUrl })
          .where(eq(playersTable.id, existing.id));
      }

      if ((existing.avatarUrl ?? null) !== avatarUrl) {
        await tx
          .update(playersTable)
          .set({ avatarUrl })
          .where(eq(playersTable.clerkUserId, clerkUserId));
      }

      return;
    }

    await tx.insert(playersTable).values({
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
  });
}