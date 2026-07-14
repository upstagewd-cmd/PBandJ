import { inArray } from "drizzle-orm";
import { db, userProfilesTable } from "@workspace/db";

export async function getNicknameMap(clerkUserIds: Array<string | null | undefined>) {
  const ids = [...new Set(clerkUserIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map<string, string | null>();

  const rows = await db
    .select({ clerkUserId: userProfilesTable.clerkUserId, nickname: userProfilesTable.nickname })
    .from(userProfilesTable)
    .where(inArray(userProfilesTable.clerkUserId, ids));

  return new Map(rows.map((row) => [row.clerkUserId, row.nickname ?? null]));
}
