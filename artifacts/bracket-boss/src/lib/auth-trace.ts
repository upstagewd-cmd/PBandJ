type TraceData = Record<string, unknown>;

type TraceEntry = {
  ts: string;
  event: string;
  data?: TraceData;
};

const STORAGE_KEY = "pbj-auth-trace-log";
const SESSION_KEY = "pbj-auth-trace-session";
const ENABLE_KEY = "pbj-trace-auth";

function getSessionId(): string {
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  sessionStorage.setItem(SESSION_KEY, created);
  return created;
}

function sanitizeUrl(input: string): string {
  try {
    const parsed = new URL(input, window.location.origin);
    const keys = Array.from(parsed.searchParams.keys());
    const query = keys.length ? `?${keys.join("&")}` : "";
    return `${parsed.pathname}${query}`;
  } catch {
    return input;
  }
}

function readEntries(): TraceEntry[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TraceEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: TraceEntry[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-250)));
  } catch {
    // Ignore storage failures.
  }
}

function createLogger(enabled: boolean, sessionId: string) {
  return (event: string, data?: TraceData) => {
    if (!enabled) return;

    const entry: TraceEntry = {
      ts: new Date().toISOString(),
      event,
      data,
    };

    const entries = readEntries();
    entries.push(entry);
    writeEntries(entries);

    console.log(`[PBJ AuthTrace ${sessionId}] ${event}`, data ?? {});
  };
}

export function isAuthTraceEnabled(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get("traceAuth") === "1") {
    localStorage.setItem(ENABLE_KEY, "1");
    return true;
  }

  if (params.get("traceAuth") === "0") {
    localStorage.removeItem(ENABLE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    return false;
  }

  return localStorage.getItem(ENABLE_KEY) === "1";
}

export function authTrace(event: string, data?: TraceData) {
  if (!isAuthTraceEnabled()) return;
  const sessionId = getSessionId();
  const log = createLogger(true, sessionId);
  log(event, data);
}

export function installAuthTrace() {
  const enabled = isAuthTraceEnabled();
  const sessionId = getSessionId();
  const log = createLogger(enabled, sessionId);

  if (!enabled) return;

  const navEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;

  log("boot", {
    path: sanitizeUrl(window.location.href),
    referrer: document.referrer ? sanitizeUrl(document.referrer) : null,
    navType: navEntry?.type ?? "unknown",
  });

  window.addEventListener("beforeunload", () => {
    log("beforeunload", { path: sanitizeUrl(window.location.href) });
  });

  window.addEventListener("pagehide", (ev) => {
    log("pagehide", { persisted: ev.persisted, path: sanitizeUrl(window.location.href) });
  });

  window.addEventListener("pageshow", (ev) => {
    log("pageshow", { persisted: ev.persisted, path: sanitizeUrl(window.location.href) });
  });

  document.addEventListener("visibilitychange", () => {
    log("visibilitychange", { state: document.visibilityState });
  });

  const origPushState = history.pushState.bind(history);
  history.pushState = function pushState(...args) {
    const nextUrl = typeof args[2] === "string" ? args[2] : String(args[2] ?? "");
    log("history.pushState", { to: sanitizeUrl(nextUrl) });
    return origPushState(...args);
  };

  const origReplaceState = history.replaceState.bind(history);
  history.replaceState = function replaceState(...args) {
    const nextUrl = typeof args[2] === "string" ? args[2] : String(args[2] ?? "");
    log("history.replaceState", { to: sanitizeUrl(nextUrl) });
    return origReplaceState(...args);
  };

  window.addEventListener("popstate", () => {
    log("popstate", { path: sanitizeUrl(window.location.href) });
  });

  (window as unknown as { pbjAuthTraceDump?: () => TraceEntry[] }).pbjAuthTraceDump = () => readEntries();
}
