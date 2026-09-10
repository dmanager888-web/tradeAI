import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { detectLang, LANGS, translate, type DictKey, type Lang } from "./i18n";
import { db } from "./storage";

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: DictKey) => string;
};

const I18nCtx = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => db.get().lang || detectLang());
  const value = useMemo<Ctx>(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    return {
      lang,
      setLang: (l) => {
        db.setLang(l);
        setLangState(l);
        document.documentElement.lang = l;
        document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
      },
      t: (key) => translate(lang, key),
    };
  }, [lang]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nCtx);
  if (!ctx) throw new Error("I18nProvider missing");
  return ctx;
}

export function LanguagePicker() {
  const { lang, setLang, t } = useI18n();
  return (
    <div>
      <div className="h">
        <h3>{t("language")}</h3>
      </div>
      <div className="chips">
        {LANGS.map((l) => (
          <button key={l.id} className={`chip ${lang === l.id ? "on" : ""}`} onClick={() => setLang(l.id)}>
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
