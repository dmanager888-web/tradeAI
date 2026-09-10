import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "./I18nProvider";
import { db, type ThemePref } from "./storage";

type Ctx = {
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
};

const ThemeCtx = createContext<Ctx | null>(null);

function resolved(pref: ThemePref): "light" | "dark" {
  if (pref === "light" || pref === "dark") return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(pref: ThemePref) {
  const mode = resolved(pref);
  document.documentElement.dataset.theme = mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", mode === "dark" ? "#000000" : "#f2f2f7");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(() => db.get().theme || "system");

  useEffect(() => {
    applyTheme(pref);
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  const value = useMemo<Ctx>(
    () => ({
      pref,
      setPref: (p) => {
        db.setTheme(p);
        setPrefState(p);
      },
    }),
    [pref],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("ThemeProvider missing");
  return ctx;
}

export function ThemePicker() {
  const { t } = useI18n();
  const { pref, setPref } = useTheme();
  const options: { id: ThemePref; label: "themeSystem" | "themeLight" | "themeDark" }[] = [
    { id: "system", label: "themeSystem" },
    { id: "light", label: "themeLight" },
    { id: "dark", label: "themeDark" },
  ];
  return (
    <div>
      <div className="h">
        <h3>{t("appearance")}</h3>
      </div>
      <div className="chips">
        {options.map((o) => (
          <button key={o.id} className={`chip ${pref === o.id ? "on" : ""}`} onClick={() => setPref(o.id)}>
            {t(o.label)}
          </button>
        ))}
      </div>
    </div>
  );
}
