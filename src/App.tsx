import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  Box,
  Camera,
  CandlestickChart,
  History,
  ImagePlus,
  KeyRound,
  LayoutTemplate,
  Minus,
  ScanLine,
  Share2,
  Sparkles,
  Trash2,
  UserRound,
  Zap,
} from "lucide-react";
import { analyzeChart } from "./analyze";
import { deleteCurrentAccount, fetchMe, isPremium, logout, type SessionUser } from "./auth";
import { startStorePurchase } from "./playBilling";
import { AuthScreen } from "./AuthScreen";
import { GoogleAdBanner, InterstitialAd } from "./GoogleAds";
import { MarketFocusModal } from "./MarketFocus";
import { LanguagePicker, useI18n } from "./I18nProvider";
import { ThemePicker } from "./Theme";
import { REPLY_IN, TPL_KEYS, type DictKey } from "./i18n";
import { db } from "./storage";
import type { AiModel, AnalysisMode, AnalysisReport, Bias, DetailPlan, MarketFocus, TabId } from "./types";
import { MAX_INSTRUCTIONS, MODEL_LABEL, promptCharLimit } from "./types";

const MODELS: AiModel[] = ["gpt", "gemini", "claude", "grok", "llama", "deepseek"];
const LIVE: AiModel[] = ["gpt"];

function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="10" width="4" height="10" rx="1" fill="white" />
      <rect x="10" y="4" width="4" height="16" rx="1" fill="white" />
      <rect x="17" y="8" width="4" height="12" rx="1" fill="white" />
      <path d="M12 3l1.2 2.4L16 6.2l-2.2 1 .2 2.6L12 8.6 9.8 9.8l.2-2.6L8 6.2l2.8-.8L12 3z" fill="white" />
    </svg>
  );
}

function tone(v: string) {
  if (v === "bullish" || v === "strong" || v === "high") return "bull";
  if (v === "bearish" || v === "weak" || v === "low") return "bear";
  return "neut";
}

function trendKey(trend: Bias): DictKey {
  if (trend === "bullish") return "trend_up";
  if (trend === "bearish") return "trend_down";
  return "trend_side";
}

function confKey(n: number): DictKey {
  if (n >= 75) return "conf_high";
  if (n <= 40) return "conf_low";
  return "conf_medium";
}

function DetailSec({ title, summary, points }: { title: string; summary?: string; points?: string[] }) {
  if (!summary && !points?.length) return null;
  return (
    <div className="detail-sec">
      <h4>{title}</h4>
      {summary ? <p>{summary}</p> : null}
      {points && points.length > 0 && (
        <ul>
          {points.map((p) => (
            <li key={p.slice(0, 48)}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlanSec({ plan, fallbackTitle }: { plan?: DetailPlan; fallbackTitle: string }) {
  if (!plan) return null;
  if (!plan.description && !plan.points?.length) return null;
  return <DetailSec title={plan.title || fallbackTitle} summary={plan.description} points={plan.points} />;
}

export default function App() {
  const { t, lang } = useI18n();
  const saved = db.get();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const premium = isPremium(user);
  const [paywall, setPaywall] = useState(false);
  const [interstitial, setInterstitial] = useState(false);
  const [onboarded, setOnboarded] = useState(saved.onboarded);
  const [slide, setSlide] = useState(0);
  const [tab, setTab] = useState<TabId>("analyze");
  const [images, setImages] = useState<string[]>([]);
  const [prompt, setPrompt] = useState(saved.lastPrompt);
  const [models, setModels] = useState<AiModel[]>(["gpt"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [reports, setReports] = useState(saved.reports);
  const [templates, setTemplates] = useState(saved.templates);
  const [instructions, setInstructions] = useState<string[]>(() =>
    saved.customInstructions?.length ? saved.customInstructions : [""],
  );
  const [marketFocus, setMarketFocus] = useState<MarketFocus | null>(saved.marketFocus ?? null);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  const applyStore = (s: ReturnType<typeof db.get>) => {
    setReports(s.reports);
    setTemplates(s.templates);
    setInstructions(s.customInstructions?.length ? s.customInstructions : [""]);
    setPrompt(s.lastPrompt);
    setMarketFocus(s.marketFocus ?? null);
    if (s.onboarded) setOnboarded(true);
  };

  useEffect(() => {
    fetchMe()
      .then(async (u) => {
        setUser(u);
        if (u) applyStore(await db.hydrate());
      })
      .finally(() => setAuthReady(true));
  }, []);

  const reload = () => {
    const s = db.get();
    setReports(s.reports);
    setTemplates(s.templates);
    setInstructions(s.customInstructions?.length ? s.customInstructions : [""]);
  };

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setImages((prev) => [...prev, String(reader.result)].slice(0, 4));
      reader.readAsDataURL(file);
    });
  };

  const run = async (mode: AnalysisMode) => {
    if (!images.length) return;
    setBusy(true);
    setError("");
    db.setPrompt(prompt, ["gpt"]);
    try {
      const extras = instructions
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s, i) => `${i + 1}. ${s}`)
        .join("\n");
      const marketLine = marketFocus ? `Market focus: ${marketFocus}.` : "";
      const r = await analyzeChart({
        images,
        prompt: [marketLine, prompt, extras ? `User rules:\n${extras}` : ""].filter(Boolean).join("\n\n"),
        models: ["gpt"],
        replyIn: REPLY_IN[lang],
        mode,
      });
      db.saveReport(r);
      setReport(r);
      reload();
      if (!isPremium(user)) setInterstitial(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("analysis_failed"));
    } finally {
      setBusy(false);
    }
  };

  const followUp = async (current: AnalysisReport, question: string) => {
    const q = question.trim();
    if (!q || !current.imageDataUrl) return;
    const r = await analyzeChart({
      images: [current.imageDataUrl],
      prompt: [
        "FOLLOW-UP on the SAME chart screenshot. Do not change the chart.",
        `Previous title: ${current.title}`,
        `Previous strategy: ${current.strategy}`,
        `Previous invalidation: ${current.invalidation}`,
        `User question: ${q}`,
        "Answer only this question using what is visible. Put the direct answer in summary. Keep JSON schema.",
      ].join("\n"),
      models: ["gpt"],
      replyIn: REPLY_IN[lang],
      mode: "fast",
    });
    const followUps = [...(current.followUps || []), { q, a: r.summary || r.strategy }];
    db.updateReport(current.id, { followUps });
    setReport({ ...current, followUps });
    reload();
  };

  const toggleModel = (m: AiModel) => {
    if (m !== "gpt") return;
    setModels(["gpt"]);
  };

  if (!authReady) {
    return (
      <div className="shell">
        <div className="loading">
          <div className="spin" />
        </div>
      </div>
    );
  }

  if (!onboarded) {
    const slides = [
      { t: t("ob1t"), d: t("ob1d") },
      { t: t("ob2t"), d: t("ob2d") },
      { t: t("ob3t"), d: t("ob3d") },
    ];
    const s = slides[slide];
    return (
      <div className="shell">
        <div className="hero">
          <div className="art">
            <Logo size={52} />
          </div>
          <div className="badge" style={{ margin: "14px auto 0", width: "fit-content" }}>
            {t("earlyAccess")}
          </div>
          <h2>{s.t}</h2>
          <p>{s.d}</p>
          <div className="dots">
            {slides.map((_, i) => (
              <i key={i} className={i === slide ? "on" : ""} />
            ))}
          </div>
        </div>
        <div style={{ padding: 16 }}>
          <LanguagePicker />
          <ThemePicker />
          <button
            className="btn primary"
            style={{ width: "100%", marginTop: 14 }}
            onClick={() => {
              if (slide < 2) setSlide(slide + 1);
              else {
                db.setOnboarded();
                setOnboarded(true);
              }
            }}
          >
            {slide < 2 ? t("continue") : t("start")}
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        onDone={async (next) => {
          setUser(next);
          applyStore(await db.hydrate());
        }}
      />
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="logo">
            <Logo />
          </div>
          <div>
            <h1>AnalysTradeAI</h1>
            <p>{t("subtitle")}</p>
          </div>
        </div>
        <span className="badge">{premium ? t("pro") : t("free")}</span>
      </header>

      <main className={premium ? "content" : "content has-ad"}>
        {tab === "analyze" && !report && (
          <>
            <div className="drop">
              {images[0] ? (
                <img src={images[0]} alt="Chart" />
              ) : (
                <div>
                  <CandlestickChart size={36} color="#7aa2ff" />
                  <h2>{t("snapTitle")}</h2>
                  <p>{t("snapHint")}</p>
                </div>
              )}
            </div>
            {images.length > 1 && (
              <div className="thumbs">
                {images.map((src, i) => (
                  <img key={i} src={src} alt={`${t("photo")} ${i + 1}`} />
                ))}
              </div>
            )}
            <div className="actions">
              <button className="btn ghost" onClick={() => camRef.current?.click()}>
                <Camera size={16} style={{ verticalAlign: "middle" }} /> {t("scan")}
              </button>
              <button className="btn ghost" onClick={() => galRef.current?.click()}>
                <ImagePlus size={16} style={{ verticalAlign: "middle" }} /> {t("gallery")}
              </button>
              {images.length > 0 && (
                <button className="btn ghost" onClick={() => setImages([])}>
                  {t("clear")}
                </button>
              )}
            </div>
            <input ref={camRef} className="hidden" type="file" accept="image/*" capture="environment" onChange={(e) => onFiles(e.target.files)} />
            <input ref={galRef} className="hidden" type="file" accept="image/*" multiple onChange={(e) => onFiles(e.target.files)} />

            <p className="muted">{t("modeFastHint")}</p>
            <p className="muted">{t("modeAdvHint")}</p>
            <div className="cta-pair">
              <button className="btn ghost" disabled={!images.length || busy} onClick={() => run("advanced")}>
                <Sparkles size={16} /> {busy ? t("analyzing") : t("modeAdvanced")}
              </button>
              <button className="btn dark" disabled={!images.length || busy} onClick={() => run("fast")}>
                <Sparkles size={16} /> {busy ? t("analyzing") : t("modeFast")}
              </button>
            </div>
            {busy && (
              <div className="card loading">
                <div className="spin" />
                <b>{t("insights")}</b>
                {t("reading")} {models.map((m) => MODEL_LABEL[m]).join(" + ")}…
              </div>
            )}
            {error && <div className="err">{error}</div>}

            <div className="features">
              <div className="feat">
                <b>{t("proInd")}</b>
                <span>{t("proIndSub")}</span>
              </div>
              <div className="feat">
                <b>{t("snapFeat")}</b>
                <span>{t("snapFeatSub")}</span>
              </div>
            </div>

            <div className="h">
              <h3>{t("promptTitle")}</h3>
            </div>
            <div className="chips" style={{ marginBottom: 8 }}>
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  className={`chip ${prompt === (TPL_KEYS.includes(tpl.id as (typeof TPL_KEYS)[number]) ? t(`tpl_${tpl.id}_body` as DictKey) : tpl.body) ? "on" : ""}`}
                  onClick={() =>
                    setPrompt(
                      TPL_KEYS.includes(tpl.id as (typeof TPL_KEYS)[number]) ? t(`tpl_${tpl.id}_body` as DictKey) : tpl.body,
                    )
                  }
                >
                  {TPL_KEYS.includes(tpl.id as (typeof TPL_KEYS)[number]) ? t(`tpl_${tpl.id}` as DictKey) : tpl.name}
                </button>
              ))}
            </div>
            <textarea
              value={prompt}
              maxLength={promptCharLimit(premium)}
              onChange={(e) => setPrompt(e.target.value.slice(0, promptCharLimit(premium)))}
            />
            <p className="muted">
              {prompt.length}/{promptCharLimit(premium)} · {t("promptCharsHint")}
            </p>
            <p className="muted">{t("offTopicHint")}</p>

            <div className="h">
              <h3>{t("multiAi")}</h3>
            </div>
            <div className="chips">
              {MODELS.map((m) => (
                <button
                  key={m}
                  className={`chip ${models.includes(m) ? "on" : ""} ${LIVE.includes(m) ? "" : "soon"}`}
                  onClick={() => toggleModel(m)}
                >
                  {MODEL_LABEL[m]}
                  {!LIVE.includes(m) ? ` · ${t("soon")}` : ""}
                </button>
              ))}
            </div>

            <p className="warn">
              {t("disclaimer")}
            </p>
          </>
        )}

        {tab === "analyze" && report && (
          <ReportView
            report={report}
            onBack={() => setReport(null)}
            onChange={reload}
            onFollowUp={(q) => followUp(report, q)}
          />
        )}

        {tab === "history" && (
          <HistoryView
            reports={reports}
            onOpen={(r) => {
              setReport(r);
              setTab("analyze");
            }}
            onChange={reload}
          />
        )}

        {tab === "templates" && (
          <InstructionsView
            premium={premium}
            items={instructions}
            onChange={(next) => {
              setInstructions(next);
              db.setInstructions(next);
            }}
          />
        )}

        {tab === "profile" && (
          <ProfileView
            count={reports.length}
            user={user}
            premium={premium}
            onPaywall={() => setPaywall(true)}
            onLogout={async () => {
              await logout();
              setUser(null);
            }}
            onDeleteAccount={async () => {
              await deleteCurrentAccount();
              db.resetOnboarding();
              setUser(null);
              setOnboarded(false);
              setSlide(0);
              setMarketFocus(null);
            }}
          />
        )}
      </main>

      {!premium && <GoogleAdBanner onUpgrade={() => setPaywall(true)} />}

      <nav className="tabbar">
        {(
          [
            ["analyze", ScanLine, t("tabScan")],
            ["history", History, t("tabSaved")],
            ["templates", LayoutTemplate, t("tabPrompts")],
            ["profile", UserRound, t("tabMe")],
          ] as const
        ).map(([id, Icon, label]) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            <Icon size={20} />
            {label}
          </button>
        ))}
      </nav>
      {interstitial && !premium && (
        <InterstitialAd
          onClose={() => setInterstitial(false)}
          onUpgrade={() => {
            setInterstitial(false);
            setPaywall(true);
          }}
        />
      )}
      {paywall && (
        <Paywall
          premium={premium}
          until={user.premiumUntil}
          onClose={() => setPaywall(false)}
          onPaid={(next) => {
            setUser(next);
            setPaywall(false);
          }}
        />
      )}
      {!marketFocus && (
        <MarketFocusModal
          onConfirm={async (focus, notify, fullscreen) => {
            if (notify && "Notification" in window && Notification.permission === "default") {
              try {
                await Notification.requestPermission();
              } catch {
                /* browser may block */
              }
            }
            db.setMarketFocus(focus, notify, fullscreen);
            setMarketFocus(focus);
          }}
        />
      )}
    </div>
  );
}

function ConfRing({ value }: { value: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <div className="conf-wrap">
      <small>CONFIDENCE</small>
      <svg className="conf-ring" viewBox="0 0 56 56" width="56" height="56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--fill)" strokeWidth="5" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke="var(--blue)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 28 28)"
        />
        <text x="28" y="32" textAnchor="middle" fontSize="11" fontWeight="800" fill="var(--ink)">
          {value}%
        </text>
      </svg>
    </div>
  );
}

function ReportView({
  report,
  onBack,
  onChange,
  onFollowUp,
}: {
  report: AnalysisReport;
  onBack: () => void;
  onChange: () => void;
  onFollowUp: (q: string) => Promise<void>;
}) {
  const { t, lang } = useI18n();
  const [notes, setNotes] = useState(report.notes);
  const [bm, setBm] = useState(report.bookmarked);
  const [ask, setAsk] = useState("");
  const [asking, setAsking] = useState(false);
  const [shareNote, setShareNote] = useState("");
  const [pick, setPick] = useState("");
  const [seeDetail, setSeeDetail] = useState(false);
  const shortShare = report.sentiment === "bearish" ? 62 : report.sentiment === "bullish" ? 38 : 50;
  const call =
    report.trend === "bearish" ? t("callShort") : report.trend === "bullish" ? t("callLong") : t("callWait");
  const d = report.detail;
  const rows = useMemo(
    () => [
      [t("confidence"), t(confKey(report.confidence)), report.confidence >= 75 ? "bullish" : report.confidence <= 40 ? "bearish" : "neutral"],
      [t("trend"), t(trendKey(report.trend)), report.trend],
      [t("volatility"), t(`vol_${report.volatility}` as DictKey), report.volatility],
      [t("volume"), t(`vol_${report.volume}` as DictKey), report.volume],
      [t("sentiment"), t(report.sentiment), report.sentiment],
    ],
    [report, t],
  );

  const persist = (patch: Partial<AnalysisReport>) => {
    db.updateReport(report.id, patch);
    onChange();
  };

  const share = async () => {
    const text = [
      report.title,
      `${t("confidence")} ${report.confidence}% · ${t(trendKey(report.trend))}`,
      `${t("outlook")}: ${d?.market_outlook || report.summary}`,
      `${t("whatToDo")}: ${d?.what_to_do.summary || report.strategy}`,
      `${t("invalidation")}: ${report.invalidation}`,
    ].join("\n");
    try {
      if (navigator.share) {
        await navigator.share({ title: report.title, text });
        return;
      }
    } catch {
      /* user cancelled or share failed */
    }
    await navigator.clipboard.writeText(text);
    setShareNote(t("shared"));
  };

  const sendFollow = async () => {
    if (!ask.trim() || asking) return;
    setAsking(true);
    try {
      await onFollowUp(ask);
      setAsk("");
    } catch {
      /* keep question so the user can retry */
    } finally {
      setAsking(false);
    }
  };

  return (
    <>
      <button className="btn ghost" onClick={onBack} style={{ marginBottom: 12 }}>
        ← {t("newChart")}
      </button>
      <div className={`card ${report.trend === "bearish" ? "accent-bear" : report.trend === "bullish" ? "accent-bull" : ""}`}>
        <img className="report-shot" src={report.imageDataUrl} alt="" />
        <div className="report-head">
          <div>
            <p className={`report-call ${tone(report.trend)}`}>{call}</p>
            <h3 style={{ margin: "6px 0 0", fontSize: 15 }}>{report.title}</h3>
          </div>
          <ConfRing value={report.confidence} />
        </div>
        <div className="muted">
          {t("snapshot")} · {new Date(report.createdAt).toLocaleString(lang)}
          {report.mode ? ` · ${report.mode === "advanced" ? t("modeAdvanced") : t("modeFast")}` : ""}
        </div>
        <div className="bar" style={{ marginTop: 10 }}>
          <i style={{ width: `${report.confidence}%` }} />
        </div>
      </div>
        <div className="h">
          <h3>{t("insights")}</h3>
        </div>
        <div className="metrics">
        {rows.map(([k, v, raw]) => (
          <button
            type="button"
            className={`metric ${pick === k ? "on" : ""} ${tone(String(raw))}`}
            key={k}
            onClick={() => setPick(pick === k ? "" : k)}
          >
            <span>{k}</span>
            <b className={tone(String(raw))}>{v}</b>
            {k === t("sentiment") && (
              <div className="sent-mini">
                <i className="sh" style={{ width: `${shortShare}%` }} />
                <i className="lg" style={{ width: `${100 - shortShare}%` }} />
              </div>
            )}
          </button>
        ))}
      </div>
      <div className={`card ${report.trend === "bearish" ? "accent-bear" : report.trend === "bullish" ? "accent-bull" : ""}`}>
        <div className="h">
          <h3>{t("conclusion")}</h3>
        </div>
        <DetailSec title={t("outlook")} summary={d?.market_outlook || report.summary} />
        <DetailSec title={t("whatToDo")} summary={d?.what_to_do.summary || report.strategy} />
        {seeDetail && (
          <>
            <DetailSec
              title={t("maSection")}
              summary={d?.moving_averages.summary}
              points={d?.moving_averages.points}
            />
            <DetailSec
              title={t("priceAction")}
              summary={d?.price_action.summary}
              points={d?.price_action.points}
            />
            <PlanSec plan={d?.what_to_do.buy_on_dip} fallbackTitle={t("buyDip")} />
            <PlanSec plan={d?.what_to_do.breakout} fallbackTitle={t("waitBreak")} />
            <PlanSec plan={d?.what_to_do.trailing_stop} fallbackTitle={t("trailStop")} />
            {report.invalidation ? (
              <DetailSec title={t("invalidation")} summary={report.invalidation} />
            ) : null}
            {!d && report.patterns.length > 0 && (
              <DetailSec title={t("patterns")} points={report.patterns.map((p) => `${p.name}: ${p.note}`)} />
            )}
            {!d && report.indicators.length > 0 && (
              <DetailSec
                title={t("indicators")}
                points={report.indicators.map((p) => `${p.name} ${p.reading} ${p.note}`.trim())}
              />
            )}
          </>
        )}
        <button type="button" className="see-more" onClick={() => setSeeDetail(!seeDetail)}>
          {seeDetail ? t("seeLess") : t("seeDetail")}
        </button>
      </div>
      {report.synthesis.length > 1 && (
      <div className="card">
        <h3>{t("multiAi")}</h3>
        {report.synthesis.map((s) => (
          <p key={s.model} className="muted" style={{ marginBottom: 8 }}>
            <b>{MODEL_LABEL[s.model] || s.model}.</b> {s.view}
          </p>
        ))}
      </div>
      )}
      <div className="card">
        <h3>{t("followTitle")}</h3>
        {(report.followUps || []).map((f, i) => (
          <div className="follow-item" key={`${f.q}-${i}`}>
            <b>{f.q}</b>
            <p className="muted">{f.a}</p>
          </div>
        ))}
        <textarea className="note" placeholder={t("followPh")} value={ask} onChange={(e) => setAsk(e.target.value)} />
        <button className="btn primary" style={{ width: "100%", marginTop: 10 }} disabled={!ask.trim() || asking} onClick={sendFollow}>
          {asking ? t("followBusy") : t("followSend")}
        </button>
      </div>
      <div className="card">
        <h3>{t("notes")}</h3>
        <textarea className="note" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => persist({ notes })} />
        <div className="actions">
          <button
            className="btn ghost"
            onClick={() => {
              const next = !bm;
              setBm(next);
              persist({ bookmarked: next });
            }}
          >
            <Bookmark size={16} /> {bm ? t("bookmarked") : t("bookmark")}
          </button>
          <button className="btn ghost" onClick={share}>
            <Share2 size={16} /> {t("share")}
          </button>
          <button
            className="btn ghost"
            onClick={async () => {
              await navigator.clipboard.writeText(`${report.title}\n${t("confidence")} ${report.confidence}%\n${report.strategy}`);
            }}
          >
            {t("copy")}
          </button>
        </div>
        {shareNote && <p className="muted">{shareNote}</p>}
      </div>
      <p className="warn">{report.summary}</p>
    </>
  );
}

function HistoryView({
  reports,
  onOpen,
  onChange,
}: {
  reports: AnalysisReport[];
  onOpen: (r: AnalysisReport) => void;
  onChange: () => void;
}) {
  const { t } = useI18n();
  const [onlyBm, setOnlyBm] = useState(false);
  const list = reports.filter((r) => (onlyBm ? r.bookmarked : true));
  return (
    <>
      <div className="h">
        <h3>{t("saved")}</h3>
        <button className={`chip ${onlyBm ? "on" : ""}`} onClick={() => setOnlyBm(!onlyBm)}>
          {t("bookmarks")}
        </button>
      </div>
      {list.length === 0 && <p className="muted">{t("emptySaved")}</p>}
      {list.map((r) => (
        <div className="card" key={r.id} style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <img className="thumb" src={r.imageDataUrl} alt="" onClick={() => onOpen(r)} />
          <div className="grow" onClick={() => onOpen(r)}>
            <h4>{r.title}</h4>
            <p>
              {r.confidence}% · {t(r.trend)}
            </p>
          </div>
          <button
            className="btn ghost"
            onClick={() => {
              db.deleteReport(r.id);
              onChange();
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </>
  );
}

function InstructionsView({
  items,
  premium,
  onChange,
}: {
  items: string[];
  premium: boolean;
  onChange: (next: string[]) => void;
}) {
  const { t } = useI18n();
  const limit = promptCharLimit(premium);
  const setAt = (i: number, value: string) => {
    const next = items.slice();
    next[i] = value.slice(0, limit);
    onChange(next);
  };
  return (
    <>
      <div className="instr-banner" aria-hidden />
      <div className="instr-head">
        <h3>{t("instrTitle")}</h3>
        <p>{t("instrSub")}</p>
        <p className="muted">{t("promptCharsHint")}</p>
      </div>
      {items.map((text, i) => (
        <div className="instr-row" key={i}>
          <div className="instr-box">
            <textarea
              value={text}
              placeholder={t("instrPh")}
              maxLength={limit}
              onChange={(e) => setAt(i, e.target.value)}
            />
            <span className="instr-count">
              {text.length}/{limit}
            </span>
          </div>
          <button
            className="instr-del"
            type="button"
            aria-label={t("delete")}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <Minus size={18} />
          </button>
        </div>
      ))}
      <button
        className="instr-add"
        type="button"
        disabled={items.length >= MAX_INSTRUCTIONS}
        onClick={() => onChange([...items, ""])}
      >
        + {t("instrAdd")} ({items.length}/{MAX_INSTRUCTIONS})
      </button>
    </>
  );
}

function Paywall({
  premium,
  until,
  onClose,
  onPaid,
}: {
  premium: boolean;
  until: number | null;
  onClose: () => void;
  onPaid: (user: SessionUser) => void;
}) {
  const { t, lang } = useI18n();
  const [plan, setPlan] = useState<"year" | "month">("year");
  const [legal, setLegal] = useState<"terms" | "privacy" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const perks = [
    { Icon: Zap, title: t("premPrioT"), body: t("premPrioD") },
    { Icon: Box, title: t("premIndT"), body: t("premIndD") },
    { Icon: History, title: t("premHistT"), body: t("premHistD") },
    { Icon: KeyRound, title: t("premPrivT"), body: t("premPrivD") },
  ] as const;
  return (
    <div className="prem-overlay">
      <div className="prem-sheet">
        <button className="plans-x" type="button" onClick={onClose} aria-label={t("close")}>
          ×
        </button>
        <h2>{t("proTitle")}</h2>
        <div className="prem-perks">
          {perks.map(({ Icon, title, body }) => (
            <div className="prem-perk" key={title}>
              <span className="prem-ico">
                <Icon size={18} />
              </span>
              <div>
                <b>{title}</b>
                <p>{body}</p>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className={`prem-plan ${plan === "year" ? "hero on" : ""}`}
          onClick={() => setPlan("year")}
        >
          <span className="prem-save">{t("premSave")}</span>
          <strong>{t("premYear")}</strong>
          <em>
            {t("premYearPrice")} · {t("premYearPerMonth")}
          </em>
        </button>
        <button type="button" className={`prem-plan ${plan === "month" ? "on" : ""}`} onClick={() => setPlan("month")}>
          <strong>{t("premMonth")}</strong>
          <em>{t("premMonthPrice")}</em>
          <span className="prem-hint">{t("premMonthHint")}</span>
        </button>
        {premium && until && (
          <p className="muted" style={{ textAlign: "center" }}>
            {t("proUntil")} {new Date(until).toLocaleDateString(lang)}
          </p>
        )}
        {!premium && (
          <button
            className="prem-cta"
            type="button"
            disabled={busy}
            onClick={async () => {
              setErr("");
              setBusy(true);
              try {
                onPaid(await startStorePurchase(plan));
              } catch (e) {
                const code = e instanceof Error ? e.message : "auth_error";
                setErr(
                  code === "store_app_only" || code === "play_android_only"
                    ? t("billingStoreOnly")
                    : code === "cancelled"
                      ? t("billingCancelled")
                      : t("auth_error"),
                );
                setBusy(false);
              }
            }}
          >
            {busy ? t("billingBusy") : t("premStart")}
          </button>
        )}
        {err && <div className="err">{err}</div>}
        <p className="prem-note">{t("premCancel")}</p>
        <p className="prem-links">
          <button type="button" className="legal-link" onClick={() => setLegal("terms")}>
            {t("premTerms")}
          </button>
          <button type="button" className="legal-link" onClick={() => setLegal("privacy")}>
            {t("premPrivacy")}
          </button>
        </p>
      </div>
      {legal && (
        <LegalSheet kind={legal} onClose={() => setLegal(null)} />
      )}
    </div>
  );
}

function LegalSheet({ kind, onClose }: { kind: "terms" | "privacy"; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="legal-overlay" role="dialog">
      <div className="legal-sheet">
        <button className="plans-x" type="button" onClick={onClose} aria-label={t("close")}>
          ×
        </button>
        <h2>{kind === "terms" ? t("premTerms") : t("premPrivacy")}</h2>
        <p className="muted">{kind === "terms" ? t("legalTermsBody") : t("legalPrivacyBody")}</p>
        <button className="btn primary" type="button" style={{ width: "100%", marginTop: 12 }} onClick={onClose}>
          {t("close")}
        </button>
      </div>
    </div>
  );
}

function ProfileView({
  count,
  user,
  premium,
  onPaywall,
  onLogout,
  onDeleteAccount,
}: {
  count: number;
  user: SessionUser;
  premium: boolean;
  onPaywall: () => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
}) {
  const { t, lang } = useI18n();
  const [installing, setInstalling] = useState("");
  const [legal, setLegal] = useState<"terms" | "privacy" | null>(null);

  const install = async () => {
    const ev = window.deferredPwa;
    if (ev) {
      await ev.prompt();
      setInstalling(t("installShown"));
      return;
    }
    setInstalling(t("installIos"));
  };

  return (
    <>
      <div className="card">
        <LanguagePicker />
      </div>
      <div className="card">
        <ThemePicker />
      </div>
      <div className="card">
        <h3>{user.name}</h3>
        <p className="muted">{user.email}</p>
        <p className="muted">{premium ? `${t("proUntil")} ${user.premiumUntil ? new Date(user.premiumUntil).toLocaleDateString(lang) : ""}` : t("accountFree")}</p>
        {!premium ? (
          <button className="btn primary" style={{ width: "100%", marginTop: 8 }} onClick={onPaywall}>
            {t("buyPro")}
          </button>
        ) : (
          <button className="btn ghost" style={{ width: "100%", marginTop: 8 }} onClick={onPaywall}>
            {t("subPro")}
          </button>
        )}
        <button className="btn danger" style={{ width: "100%", marginTop: 8 }} onClick={onLogout}>
          {t("logout")}
        </button>
        <button className="btn danger" style={{ width: "100%", marginTop: 8 }} onClick={onDeleteAccount}>
          {t("deleteAccount")}
        </button>
        <p className="muted" style={{ marginTop: 8 }}>
          {t("deleteAccountHint")}
        </p>
      </div>
      <div className="card">
        <h3>{t("install")}</h3>
        <p className="muted">{t("installHint")}</p>
        <button className="btn primary" style={{ width: "100%", marginTop: 8 }} onClick={install}>
          {t("addHome")}
        </button>
        {installing && <p className="muted">{installing}</p>}
      </div>
      <div className="card">
        <h3>{t("privacy")}</h3>
        <p className="muted">{t("privacyBody")}</p>
        <p className="muted">{t("savedCount")}: {count}</p>
        <button className="btn ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => setLegal("terms")}>
          {t("premTerms")}
        </button>
        <button className="btn ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => setLegal("privacy")}>
          {t("premPrivacy")}
        </button>
      </div>
      <p className="warn">{t("legal")}</p>
      {legal && <LegalSheet kind={legal} onClose={() => setLegal(null)} />}
    </>
  );
}
