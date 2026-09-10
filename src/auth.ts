import { api } from "./api";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  premiumUntil: number | null;
  createdAt: string;
};

export function isPremium(user: SessionUser | null) {
  if (!user?.premiumUntil) return false;
  return user.premiumUntil > Date.now();
}

export async function fetchMe(): Promise<SessionUser | null> {
  try {
    const data = await api<{ user: SessionUser }>("/api/auth/me");
    return data.user;
  } catch {
    return null;
  }
}

export async function register(name: string, email: string, password: string) {
  const data = await api<{ user: SessionUser }>("/api/auth/register", {
    method: "POST",
    body: { name, email, password },
  });
  return data.user;
}

export async function login(email: string, password: string) {
  const data = await api<{ user: SessionUser }>("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  return data.user;
}

export async function logout() {
  await api("/api/auth/logout", { method: "POST" }).catch(() => null);
}

export async function deleteCurrentAccount() {
  await api("/api/auth/delete", { method: "POST" });
}
