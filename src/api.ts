export async function api<T = Record<string, unknown>>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(path, {
    method: init?.method || "GET",
    credentials: "include",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || "request_failed");
  return json;
}

export async function apiQuiet<T = Record<string, unknown>>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T | null> {
  try {
    return await api<T>(path, init);
  } catch {
    return null;
  }
}
