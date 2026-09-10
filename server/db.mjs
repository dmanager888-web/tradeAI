import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

process.env.SQLITE_TMPDIR = process.env.SQLITE_TMPDIR || "/tmp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH;
const dbPath =
  process.env.DATABASE_PATH ||
  (volume ? path.join(volume, "analystradeai.sqlite") : path.join(root, "data", "analystradeai.sqlite"));
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
console.log("[db] file:", dbPath);
export const sqlite = new Database(dbPath, { timeout: 8000 });
const onVolume = Boolean(volume || process.env.RAILWAY_ENVIRONMENT);
sqlite.pragma(onVolume ? "journal_mode = DELETE" : "journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

function addColumn(table, name, spec) {
  try {
    const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.length || cols.includes(name)) return;
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${spec}`);
  } catch (err) {
    console.warn("[db] skip column", table, name, err instanceof Error ? err.message : err);
  }
}

sqlite.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  premium_until INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  onboarded INTEGER NOT NULL DEFAULT 0,
  lang TEXT,
  theme TEXT DEFAULT 'system',
  market_focus TEXT,
  notify_permission INTEGER NOT NULL DEFAULT 0,
  fullscreen_alerts INTEGER NOT NULL DEFAULT 0,
  last_prompt TEXT,
  last_models TEXT NOT NULL DEFAULT '["gpt"]',
  custom_instructions TEXT NOT NULL DEFAULT '[""]',
  templates TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  condition TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
`);

addColumn("users", "stripe_customer_id", "TEXT");
addColumn("users", "stripe_subscription_id", "TEXT");
addColumn("users", "play_purchase_token", "TEXT");
addColumn("users", "play_product_id", "TEXT");

const DEFAULT_TEMPLATES = [
  {
    id: "swing",
    name: "Swing setup",
    body: "Analyze this chart as a swing trader. Identify trend, key support/resistance, the dominant pattern, and a high-probability setup with invalidation. Keep it concise.",
  },
  {
    id: "scalp",
    name: "Scalp / intraday",
    body: "Give an intraday read: momentum, volume confirmation, nearest liquidity pools, and whether to wait or act. Flag fakeouts.",
  },
  {
    id: "risk",
    name: "Risk check",
    body: "Challenge my bullish bias. List reasons this move could fail, volatility risks, and what would confirm continuation vs reversal.",
  },
  {
    id: "indicators",
    name: "Indicators",
    body: "Explain RSI, MACD, moving averages and volume overlays visible on this chart in plain language. Tie each to price action.",
  },
];

function uid() {
  return randomBytes(16).toString("hex");
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 32);
  const prev = Buffer.from(hash, "hex");
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    premiumUntil: row.premium_until || null,
    createdAt: row.created_at,
  };
}

export function createUser({ name, email, password }) {
  const id = uid();
  const createdAt = new Date().toISOString();
  sqlite
    .prepare(
      "INSERT INTO users (id, name, email, password_hash, premium_until, created_at) VALUES (?, ?, ?, ?, NULL, ?)",
    )
    .run(id, name, email, hashPassword(password), createdAt);
  sqlite
    .prepare(
      `INSERT INTO settings (user_id, last_prompt, templates) VALUES (?, ?, ?)`,
    )
    .run(id, DEFAULT_TEMPLATES[0].body, JSON.stringify(DEFAULT_TEMPLATES));
  sqlite
    .prepare("INSERT INTO alerts (id, user_id, title, condition, active) VALUES (?, ?, ?, ?, 1)")
    .run(
      uid(),
      id,
      "Breakout watch",
      "Price closes above range high with volume spike",
    );
  return getUserById(id);
}

export function getUserById(id) {
  return sqlite.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

export function getUserByEmail(email) {
  return sqlite.prepare("SELECT * FROM users WHERE email = ?").get(email);
}

export function createSession(userId) {
  const token = randomBytes(32).toString("hex");
  sqlite.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").run(
    token,
    userId,
    new Date().toISOString(),
  );
  return token;
}

export function userFromToken(token) {
  if (!token) return null;
  const row = sqlite
    .prepare(
      "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?",
    )
    .get(token);
  return row || null;
}

export function deleteSession(token) {
  if (token) sqlite.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function deleteUser(id) {
  sqlite.prepare("DELETE FROM users WHERE id = ?").run(id);
}

export function setPremiumUntil(userId, untilMs) {
  sqlite.prepare("UPDATE users SET premium_until = ? WHERE id = ?").run(untilMs || null, userId);
  return getUserById(userId);
}

export function setPlayPurchase(userId, token, productId) {
  sqlite
    .prepare("UPDATE users SET play_purchase_token = ?, play_product_id = ? WHERE id = ?")
    .run(token || null, productId || null, userId);
}

function parseJson(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function getStore(userId) {
  const s = sqlite.prepare("SELECT * FROM settings WHERE user_id = ?").get(userId);
  const reports = sqlite
    .prepare("SELECT payload FROM reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 80")
    .all(userId)
    .map((r) => parseJson(r.payload, null))
    .filter(Boolean);
  const alerts = sqlite
    .prepare("SELECT id, title, condition, active FROM alerts WHERE user_id = ? ORDER BY rowid DESC")
    .all(userId)
    .map((a) => ({ id: a.id, title: a.title, condition: a.condition, active: Boolean(a.active) }));
  return {
    reports,
    alerts,
    templates: parseJson(s?.templates, DEFAULT_TEMPLATES),
    onboarded: Boolean(s?.onboarded),
    lang: s?.lang || undefined,
    theme: s?.theme || "system",
    marketFocus: s?.market_focus || null,
    notifyPermission: Boolean(s?.notify_permission),
    fullscreenAlerts: Boolean(s?.fullscreen_alerts),
    lastPrompt: s?.last_prompt || DEFAULT_TEMPLATES[0].body,
    lastModels: parseJson(s?.last_models, ["gpt"]),
    customInstructions: parseJson(s?.custom_instructions, [""]),
  };
}

export function patchSettings(userId, patch) {
  const cur = getStore(userId);
  const next = { ...cur, ...patch };
  sqlite
    .prepare(
      `UPDATE settings SET
        onboarded = ?, lang = ?, theme = ?, market_focus = ?,
        notify_permission = ?, fullscreen_alerts = ?, last_prompt = ?,
        last_models = ?, custom_instructions = ?, templates = ?
      WHERE user_id = ?`,
    )
    .run(
      next.onboarded ? 1 : 0,
      next.lang || null,
      next.theme || "system",
      next.marketFocus || null,
      next.notifyPermission ? 1 : 0,
      next.fullscreenAlerts ? 1 : 0,
      next.lastPrompt || "",
      JSON.stringify(next.lastModels || ["gpt"]),
      JSON.stringify(next.customInstructions || [""]),
      JSON.stringify(next.templates || DEFAULT_TEMPLATES),
      userId,
    );
  return getStore(userId);
}

export function upsertReport(userId, report) {
  const payload = JSON.stringify(report);
  const existing = sqlite.prepare("SELECT id FROM reports WHERE id = ? AND user_id = ?").get(report.id, userId);
  if (existing) {
    sqlite.prepare("UPDATE reports SET payload = ?, created_at = ? WHERE id = ? AND user_id = ?").run(
      payload,
      report.createdAt || new Date().toISOString(),
      report.id,
      userId,
    );
  } else {
    sqlite.prepare("INSERT INTO reports (id, user_id, created_at, payload) VALUES (?, ?, ?, ?)").run(
      report.id,
      userId,
      report.createdAt || new Date().toISOString(),
      payload,
    );
  }
  const extras = sqlite
    .prepare("SELECT id FROM reports WHERE user_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET 80")
    .all(userId);
  if (extras.length) {
    const del = sqlite.prepare("DELETE FROM reports WHERE id = ?");
    for (const row of extras) del.run(row.id);
  }
}

export function patchReport(userId, id, patch) {
  const row = sqlite.prepare("SELECT payload FROM reports WHERE id = ? AND user_id = ?").get(id, userId);
  if (!row) return null;
  const report = { ...parseJson(row.payload, {}), ...patch, id };
  sqlite.prepare("UPDATE reports SET payload = ? WHERE id = ? AND user_id = ?").run(JSON.stringify(report), id, userId);
  return report;
}

export function removeReport(userId, id) {
  sqlite.prepare("DELETE FROM reports WHERE id = ? AND user_id = ?").run(id, userId);
}

export function upsertAlert(userId, alert) {
  const existing = sqlite.prepare("SELECT id FROM alerts WHERE id = ? AND user_id = ?").get(alert.id, userId);
  if (existing) {
    sqlite.prepare("UPDATE alerts SET title = ?, condition = ?, active = ? WHERE id = ? AND user_id = ?").run(
      alert.title,
      alert.condition,
      alert.active ? 1 : 0,
      alert.id,
      userId,
    );
  } else {
    sqlite.prepare("INSERT INTO alerts (id, user_id, title, condition, active) VALUES (?, ?, ?, ?, ?)").run(
      alert.id,
      userId,
      alert.title,
      alert.condition,
      alert.active ? 1 : 0,
    );
  }
}

export function removeAlert(userId, id) {
  sqlite.prepare("DELETE FROM alerts WHERE id = ? AND user_id = ?").run(id, userId);
}
