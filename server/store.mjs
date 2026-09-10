import {
  createSession,
  createUser,
  deleteSession,
  deleteUser,
  getStore,
  getUserByEmail,
  patchReport,
  patchSettings,
  publicUser,
  removeAlert,
  removeReport,
  setPremiumUntil,
  upsertAlert,
  upsertReport,
  userFromToken,
  verifyPassword,
} from "./db.mjs";
import { activateAppleIap, activateGooglePlay } from "./billing.mjs";

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

const MAX_BODY = 64 * 1024;
const LOGIN_MAX = 5;
const REGISTER_MAX = 8;
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const NAME_MAX = 80;
const EMAIL_MAX = 254;
const PASSWORD_MAX = 128;
const attempts = new Map();

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return forwarded || req.socket?.remoteAddress || "unknown";
}

function limited(key, max) {
  const now = Date.now();
  const row = attempts.get(key);
  if (!row || now - row.start > AUTH_WINDOW_MS) return false;
  return row.n >= max;
}

function bump(key) {
  const now = Date.now();
  const row = attempts.get(key);
  if (!row || now - row.start > AUTH_WINDOW_MS) {
    attempts.set(key, { n: 1, start: now });
    return;
  }
  row.n += 1;
}

function clearAttempts(key) {
  attempts.delete(key);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new Error("body_too_large");
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function cookieToken(req) {
  const raw = String(req.headers.cookie || "");
  const m = raw.match(/(?:^|;\s*)tb_sid=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

function cookieFlags() {
  const https = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.COOKIE_SECURE);
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${https ? "; Secure" : ""}`;
}

function setSid(res, token) {
  res.setHeader("Set-Cookie", `tb_sid=${encodeURIComponent(token)}; ${cookieFlags()}`);
}

function clearSid(res) {
  res.setHeader("Set-Cookie", `tb_sid=; ${cookieFlags()}; Max-Age=0`);
}

function authUser(req) {
  return userFromToken(cookieToken(req));
}

export async function handleApi(req, res, env = process.env) {
  const path = String(req.url || "").split("?")[0];
  const ours =
    path.startsWith("/api/auth") ||
    path.startsWith("/api/store") ||
    path.startsWith("/api/reports") ||
    path.startsWith("/api/alerts") ||
    path.startsWith("/api/billing");
  if (!ours) return false;

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }

  try {
    if (path === "/api/auth/register" && req.method === "POST") {
      const ip = clientIp(req);
      const regKey = `reg:${ip}`;
      if (limited(regKey, REGISTER_MAX)) return json(res, 429, { error: "too_many_attempts" }), true;
      bump(regKey);
      const body = await readBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const name = String(body.name || "").trim().slice(0, NAME_MAX) || email.split("@")[0];
      if (!email.includes("@") || email.length > EMAIL_MAX) return json(res, 400, { error: "email_invalid" }), true;
      if (password.length < 6) return json(res, 400, { error: "password_short" }), true;
      if (password.length > PASSWORD_MAX) return json(res, 400, { error: "password_long" }), true;
      if (getUserByEmail(email)) return json(res, 400, { error: "email_taken" }), true;
      const user = createUser({ name, email, password });
      setSid(res, createSession(user.id));
      return json(res, 200, { user: publicUser(user) }), true;
    }

    if (path === "/api/auth/login" && req.method === "POST") {
      const body = await readBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const ip = clientIp(req);
      const loginKey = `login:${ip}:${email}`;
      if (limited(loginKey, LOGIN_MAX)) return json(res, 429, { error: "too_many_attempts" }), true;
      if (!email.includes("@") || email.length > EMAIL_MAX) return json(res, 400, { error: "email_invalid" }), true;
      if (password.length > PASSWORD_MAX) return json(res, 400, { error: "password_long" }), true;
      const user = getUserByEmail(email);
      if (!user || !verifyPassword(password, user.password_hash)) {
        bump(loginKey);
        return json(res, 400, { error: user ? "bad_password" : "not_found" }), true;
      }
      clearAttempts(loginKey);
      setSid(res, createSession(user.id));
      return json(res, 200, { user: publicUser(user) }), true;
    }

    if (path === "/api/auth/logout" && req.method === "POST") {
      deleteSession(cookieToken(req));
      clearSid(res);
      return json(res, 200, { ok: true }), true;
    }

    if (path === "/api/auth/me" && req.method === "GET") {
      const user = authUser(req);
      if (!user) return json(res, 401, { error: "unauthorized" }), true;
      return json(res, 200, { user: publicUser(user) }), true;
    }

    if (path === "/api/auth/delete" && req.method === "POST") {
      const user = authUser(req);
      if (!user) return json(res, 401, { error: "unauthorized" }), true;
      deleteUser(user.id);
      clearSid(res);
      return json(res, 200, { ok: true }), true;
    }

    if (path === "/api/billing/google" && req.method === "POST") {
      const user = authUser(req);
      if (!user) return json(res, 401, { error: "unauthorized" }), true;
      const body = await readBody(req);
      try {
        const next = await activateGooglePlay(env, user, body);
        return json(res, 200, { user: next }), true;
      } catch (e) {
        return json(res, 400, { error: e.message || "bad_purchase" }), true;
      }
    }

    if (path === "/api/billing/apple" && req.method === "POST") {
      const user = authUser(req);
      if (!user) return json(res, 401, { error: "unauthorized" }), true;
      const body = await readBody(req);
      try {
        const next = await activateAppleIap(env, user, body);
        return json(res, 200, { user: next }), true;
      } catch (e) {
        return json(res, 400, { error: e.message || "bad_purchase" }), true;
      }
    }

    if (path === "/api/store" && req.method === "GET") {
      const user = authUser(req);
      if (!user) return json(res, 401, { error: "unauthorized" }), true;
      return json(res, 200, getStore(user.id)), true;
    }

    if (path === "/api/store" && req.method === "PUT") {
      const user = authUser(req);
      if (!user) return json(res, 401, { error: "unauthorized" }), true;
      const body = await readBody(req);
      return json(res, 200, patchSettings(user.id, body)), true;
    }

    if (path === "/api/reports" && req.method === "POST") {
      const user = authUser(req);
      if (!user) return json(res, 401, { error: "unauthorized" }), true;
      const body = await readBody(req);
      if (!body?.id) return json(res, 400, { error: "bad_report" }), true;
      upsertReport(user.id, body);
      return json(res, 200, { ok: true }), true;
    }

    if (path === "/api/reports" && req.method === "PUT") {
      const user = authUser(req);
      if (!user) return json(res, 401, { error: "unauthorized" }), true;
      const body = await readBody(req);
      const report = patchReport(user.id, body.id, body.patch || {});
      if (!report) return json(res, 404, { error: "not_found" }), true;
      return json(res, 200, { report }), true;
    }

    if (path === "/api/reports" && req.method === "DELETE") {
      const user = authUser(req);
      if (!user) return json(res, 401, { error: "unauthorized" }), true;
      const url = new URL(req.url, "http://local");
      removeReport(user.id, url.searchParams.get("id") || "");
      return json(res, 200, { ok: true }), true;
    }

    if (path === "/api/alerts" && req.method === "POST") {
      const user = authUser(req);
      if (!user) return json(res, 401, { error: "unauthorized" }), true;
      const body = await readBody(req);
      if (!body?.id) return json(res, 400, { error: "bad_alert" }), true;
      upsertAlert(user.id, body);
      return json(res, 200, { ok: true }), true;
    }

    if (path === "/api/alerts" && req.method === "DELETE") {
      const user = authUser(req);
      if (!user) return json(res, 401, { error: "unauthorized" }), true;
      const url = new URL(req.url, "http://local");
      removeAlert(user.id, url.searchParams.get("id") || "");
      return json(res, 200, { ok: true }), true;
    }

    json(res, 404, { error: "not_found" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "db_error";
    if (msg === "body_too_large") return json(res, 413, { error: "body_too_large" }), true;
    json(res, 500, { error: "db_error" });
  }
  return true;
}
