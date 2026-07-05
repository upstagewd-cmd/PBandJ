export function adminFetch(
  code: string,
  path: string,
  options?: RequestInit,
): Promise<Response> {
  return fetch(`/api/admin${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-admin-code": code,
      ...(options?.headers ?? {}),
    },
  });
}

export async function adminGet<T>(code: string, path: string): Promise<T> {
  const res = await adminFetch(code, path);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export async function adminPost<T>(
  code: string,
  path: string,
  body: unknown,
): Promise<T> {
  const res = await adminFetch(code, path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export async function adminPatch<T>(
  code: string,
  path: string,
  body: unknown,
): Promise<T> {
  const res = await adminFetch(code, path, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export async function adminDelete(code: string, path: string): Promise<void> {
  const res = await adminFetch(code, path, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}
