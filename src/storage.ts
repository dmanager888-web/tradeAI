import { apiQuiet } from "./api";
import type { Lang } from "./i18n";
import type { AiModel, AnalysisReport, Bias, MarketFocus, PriceAlert, PromptTemplate } from "./types";
import { MAX_INSTRUCTIONS, PRO_PROMPT_CHARS } from "./types";

export type ThemePref = "system" | "light" | "dark";

const KEY = "analystradeai.v1";

export const DEFAULT_TEMPLATES: PromptTemplate[] = [
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

type Store = {
  onboarded: boolean;
  reports: AnalysisReport[];
  templates: PromptTemplate[];
  alerts: PriceAlert[];
  lastPrompt: string;
  lastModels: AiModel[];
  customInstructions: string[];
  openaiKey: string;
  anthropicKey: string;
  geminiKey: string;
  lang?: Lang;
  theme?: ThemePref;
  marketFocus?: MarketFocus | null;
  notifyPermission?: boolean;
  fullscreenAlerts?: boolean;
};

const empty: Store = {
  onboarded: false,
  reports: [],
  templates: DEFAULT_TEMPLATES,
  alerts: [
    {
      id: "a1",
      title: "Breakout watch",
      condition: "Price closes above range high with volume spike",
      active: true,
    },
  ],
  lastPrompt: DEFAULT_TEMPLATES[0].body,
  lastModels: ["gpt"],
  customInstructions: [""],
  openaiKey: "",
  anthropicKey: "",
  geminiKey: "",
  theme: "system",
  marketFocus: null,
  notifyPermission: false,
  fullscreenAlerts: false,
};

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    return { ...empty, ...JSON.parse(raw) };
  } catch {
    return empty;
  }
}

function write(s: Store) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

async function pushSettings(patch: Record<string, unknown>) {
  await apiQuiet("/api/store", { method: "PUT", body: patch });
}

export const db = {
  get: read,
  async hydrate() {
    const remote = await apiQuiet<Partial<Store>>("/api/store");
    if (!remote) return read();
    const local = read();
    const next = {
      ...local,
      ...remote,
      onboarded: Boolean(local.onboarded || remote.onboarded),
      openaiKey: local.openaiKey,
      anthropicKey: local.anthropicKey,
      geminiKey: local.geminiKey,
    };
    write(next);
    return next;
  },
  setOnboarded() {
    const s = read();
    s.onboarded = true;
    write(s);
    void pushSettings({ onboarded: true });
  },
  resetOnboarding() {
    const s = read();
    s.onboarded = false;
    s.marketFocus = null;
    s.notifyPermission = false;
    s.fullscreenAlerts = false;
    write(s);
    void pushSettings({
      onboarded: false,
      marketFocus: null,
      notifyPermission: false,
      fullscreenAlerts: false,
    });
  },
  saveReport(r: AnalysisReport) {
    const s = read();
    s.reports = [r, ...s.reports.filter((x) => x.id !== r.id)].slice(0, 80);
    write(s);
    void apiQuiet("/api/reports", { method: "POST", body: r });
  },
  updateReport(id: string, patch: Partial<AnalysisReport>) {
    const s = read();
    s.reports = s.reports.map((r) => (r.id === id ? { ...r, ...patch } : r));
    write(s);
    void apiQuiet("/api/reports", { method: "PUT", body: { id, patch } });
  },
  deleteReport(id: string) {
    const s = read();
    s.reports = s.reports.filter((r) => r.id !== id);
    write(s);
    void apiQuiet(`/api/reports?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  setPrompt(prompt: string, models: AiModel[]) {
    const s = read();
    s.lastPrompt = prompt;
    s.lastModels = models;
    write(s);
    void pushSettings({ lastPrompt: prompt, lastModels: models });
  },
  setInstructions(list: string[]) {
    const s = read();
    s.customInstructions = list.slice(0, MAX_INSTRUCTIONS).map((x) => x.slice(0, PRO_PROMPT_CHARS));
    write(s);
    void pushSettings({ customInstructions: s.customInstructions });
  },
  setKeys(openaiKey: string, anthropicKey: string, geminiKey: string) {
    const s = read();
    s.openaiKey = openaiKey;
    s.anthropicKey = anthropicKey;
    s.geminiKey = geminiKey;
    write(s);
  },
  setLang(lang: Lang) {
    const s = read();
    s.lang = lang;
    write(s);
    void pushSettings({ lang });
  },
  setTheme(theme: ThemePref) {
    const s = read();
    s.theme = theme;
    write(s);
    void pushSettings({ theme });
  },
  setMarketFocus(focus: MarketFocus, notifyPermission: boolean, fullscreenAlerts: boolean) {
    const s = read();
    s.marketFocus = focus;
    s.notifyPermission = notifyPermission;
    s.fullscreenAlerts = fullscreenAlerts;
    write(s);
    void pushSettings({ marketFocus: focus, notifyPermission, fullscreenAlerts });
  },
  saveTemplate(t: PromptTemplate) {
    const s = read();
    const i = s.templates.findIndex((x) => x.id === t.id);
    if (i >= 0) s.templates[i] = t;
    else s.templates.unshift(t);
    write(s);
    void pushSettings({ templates: s.templates });
  },
  deleteTemplate(id: string) {
    const s = read();
    s.templates = s.templates.filter((t) => t.id !== id);
    write(s);
    void pushSettings({ templates: s.templates });
  },
  saveAlert(a: PriceAlert) {
    const s = read();
    const i = s.alerts.findIndex((x) => x.id === a.id);
    if (i >= 0) s.alerts[i] = a;
    else s.alerts.unshift(a);
    write(s);
    void apiQuiet("/api/alerts", { method: "POST", body: a });
  },
  deleteAlert(id: string) {
    const s = read();
    s.alerts = s.alerts.filter((a) => a.id !== id);
    write(s);
    void apiQuiet(`/api/alerts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

export const biasLabel = (b: Bias) =>
  b === "bullish" ? "Bullish" : b === "bearish" ? "Bearish" : "Neutral";
