import { and, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db, userProfilesTable, playersTable, sessionPlayersTable } from "@workspace/db";
import { clerkClient } from "@clerk/express";

export async function getNicknameMap(clerkUserIds: Array<string | null | undefined>) {
  const ids = [...new Set(clerkUserIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map<string, string | null>();

  const rows = await db
    .select({ clerkUserId: userProfilesTable.clerkUserId, nickname: userProfilesTable.nickname })
    .from(userProfilesTable)
    .where(inArray(userProfilesTable.clerkUserId, ids));

  return new Map(rows.map((row) => [row.clerkUserId, row.nickname ?? null]));
}

export async function getClerkImageMap(clerkUserIds: Array<string | null | undefined>) {
  const ids = [...new Set(clerkUserIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map<string, string | null>();

  const pairs = await Promise.all(
    ids.map(async (id) => {
      const user = await clerkClient.users.getUser(id).catch(() => null);
      return [id, user?.imageUrl ?? null] as const;
    })
  );

  return new Map<string, string | null>(pairs);
}

export async function isNicknameTakenGlobal(
  nicknameInput: string,
  options?: {
    excludeClerkUserId?: string | null;
    excludePlayerId?: string | null;
    excludeSessionPlayerId?: string | null;
  }
) {
  const nickname = nicknameInput.trim();
  if (!nickname) return false;

  const normalized = nickname.toLowerCase();
  const excludeClerkUserId = options?.excludeClerkUserId ?? null;
  const excludePlayerId = options?.excludePlayerId ?? null;
  const excludeSessionPlayerId = options?.excludeSessionPlayerId ?? null;

  const [profileTaken] = await db
    .select({ clerkUserId: userProfilesTable.clerkUserId })
    .from(userProfilesTable)
    .where(
      and(
        sql`lower(${userProfilesTable.nickname}) = ${normalized}`,
        excludeClerkUserId ? ne(userProfilesTable.clerkUserId, excludeClerkUserId) : sql`true`
      )
    )
    .limit(1);
  if (profileTaken) return true;

  const [playerTaken] = await db
    .select({ id: playersTable.id })
    .from(playersTable)
    .where(
      and(
        sql`lower(${playersTable.teamName}) = ${normalized}`,
        excludePlayerId ? ne(playersTable.id, excludePlayerId) : sql`true`,
        excludeClerkUserId
          ? or(isNull(playersTable.clerkUserId), ne(playersTable.clerkUserId, excludeClerkUserId))
          : sql`true`
      )
    )
    .limit(1);
  if (playerTaken) return true;

  const [sessionPlayerTaken] = await db
    .select({ id: sessionPlayersTable.id })
    .from(sessionPlayersTable)
    .where(
      and(
        sql`lower(${sessionPlayersTable.teamName}) = ${normalized}`,
        excludeSessionPlayerId ? ne(sessionPlayersTable.id, excludeSessionPlayerId) : sql`true`,
        excludeClerkUserId
          ? or(isNull(sessionPlayersTable.clerkUserId), ne(sessionPlayersTable.clerkUserId, excludeClerkUserId))
          : sql`true`
      )
    )
    .limit(1);

  return !!sessionPlayerTaken;
}
