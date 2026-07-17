const SEEN_BADGE_GRANTS_PREFIX = "seenBadgeGrants";

function storageKey(userId: string) {
  return `${SEEN_BADGE_GRANTS_PREFIX}_${userId}`;
}

export function getSeenBadgeGrantIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw) as string[];
    return new Set(parsed.filter(Boolean));
  } catch {
    return new Set<string>();
  }
}

export function saveSeenBadgeGrantIds(userId: string, ids: Set<string>) {
  const limited = [...ids].slice(-500);
  localStorage.setItem(storageKey(userId), JSON.stringify(limited));
}

export function markSeenBadgeGrantIds(userId: string, grantIds: string[]) {
  if (grantIds.length === 0) return;
  const current = getSeenBadgeGrantIds(userId);
  for (const id of grantIds) current.add(id);
  saveSeenBadgeGrantIds(userId, current);
}

export function hasSeenBadgeGrantId(userId: string, grantId: string) {
  return getSeenBadgeGrantIds(userId).has(grantId);
}

export function ensureBadgeSeenBaseline(userId: string, grantIds: string[]) {
  const existingRaw = localStorage.getItem(storageKey(userId));
  if (existingRaw !== null) return;
  const baseline = new Set(grantIds.filter(Boolean));
  saveSeenBadgeGrantIds(userId, baseline);
}
