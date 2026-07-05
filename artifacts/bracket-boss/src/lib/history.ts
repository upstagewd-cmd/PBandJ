export interface HistoryEntry {
  id: string;
  type: "tournament" | "session";
  name: string;
  status: string;
  visitedAt: string;
}

const STORAGE_KEY = "pbj_history";
const MAX_ENTRIES = 20;

export function getHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

export function upsertHistory(entry: Omit<HistoryEntry, "visitedAt">) {
  const entries = getHistory().filter((e) => e.id !== entry.id);
  const updated: HistoryEntry[] = [
    { ...entry, visitedAt: new Date().toISOString() },
    ...entries,
  ].slice(0, MAX_ENTRIES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function formatVisitedAt(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 2) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function removeHistory(id: string) {
  const entries = getHistory().filter((e) => e.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function defaultGameName(): string {
  const now = new Date();
  return now.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }) + " at " + now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
