import { useState } from "react";
import { login, register, type SessionUser } from "./auth";
import { LanguagePicker, useI18n } from "./I18nProvider";
import { ThemePicker } from "./Theme";
import type { DictKey } from "./i18n";

export function AuthScreen({ onDone }: { onDone: (user: SessionUser) => void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const user = mode === "register" ? await register(name, email, password) : await login(email, password);
      onDone(user);
    } catch (e) {
      const code = e instanceof Error ? e.message : "auth_error";
      const known: DictKey[] = [
        "email_invalid",
        "password_short",
        "password_long",
        "too_many_attempts",
        "email_taken",
        "not_found",
        "bad_password",
      ];
      setError(t(known.includes(code as DictKey) ? (code as DictKey) : "auth_error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shell">
      <div className="hero">
        <div className="art">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="10" width="4" height="10" rx="1" fill="white" />
            <rect x="10" y="4" width="4" height="16" rx="1" fill="white" />
            <rect x="17" y="8" width="4" height="12" rx="1" fill="white" />
            <path d="M12 3l1.2 2.4L16 6.2l-2.2 1 .2 2.6L12 8.6 9.8 9.8l.2-2.6L8 6.2l2.8-.8L12 3z" fill="white" />
          </svg>
        </div>
        <div className="badge" style={{ margin: "14px auto 0", width: "fit-content" }}>
          {t("earlyAccess")}
        </div>
        <h2>{mode === "register" ? t("createAcc") : t("welcome")}</h2>
        <p>{t("authHint")}</p>
      </div>
      <div style={{ padding: 16 }}>
        <LanguagePicker />
        <ThemePicker />
        <div className="chips" style={{ margin: "12px 0" }}>
          <button className={`chip ${mode === "register" ? "on" : ""}`} onClick={() => setMode("register")}>
            {t("register")}
          </button>
          <button className={`chip ${mode === "login" ? "on" : ""}`} onClick={() => setMode("login")}>
            {t("login")}
          </button>
        </div>
        {mode === "register" && (
          <input className="note" placeholder={t("namePh")} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 8 }} />
        )}
        <input className="note" type="email" placeholder={t("email")} value={email} maxLength={254} autoComplete="email" onChange={(e) => setEmail(e.target.value)} style={{ marginBottom: 8 }} />
        <input className="note" type="password" placeholder={t("password")} value={password} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="err">{error}</div>}
        <button className="btn primary" style={{ width: "100%", marginTop: 14 }} disabled={busy} onClick={submit}>
          {busy ? "…" : mode === "register" ? t("doRegister") : t("doLogin")}
        </button>
        <p className="muted" style={{ marginTop: 12 }}>
          {t("authAds")}
        </p>
      </div>
    </div>
  );
}
