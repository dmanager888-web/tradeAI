import { uid } from "./id";
import type { AiModel, AnalysisMode, AnalysisReport, Bias, DetailBlock, DetailPlan, ReportDetail } from "./types";

function compressImage(dataUrl: string, max = 1400): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable"));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.84));
    };
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = dataUrl;
  });
}

function asBias(v: unknown): Bias {
  const s = String(v || "").toLowerCase();
  if (s.includes("up") || s.includes("bull")) return "bullish";
  if (s.includes("down") || s.includes("bear")) return "bearish";
  return "neutral";
}

function asVol(v: unknown): AnalysisReport["volatility"] {
  const s = String(v || "").toLowerCase();
  if (s.includes("high")) return "high";
  if (s.includes("low")) return "low";
  return "medium";
}

function asVolume(v: unknown): AnalysisReport["volume"] {
  const s = String(v || "").toLowerCase();
  if (s.includes("high") || s.includes("strong")) return "strong";
  if (s.includes("low") || s.includes("weak")) return "weak";
  return "average";
}

function asConfidence(raw: unknown, label: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.min(100, Math.round(raw)));
  const s = String(label || raw || "").toLowerCase();
  if (s.includes("high")) return 85;
  if (s.includes("low")) return 35;
  if (s.includes("medium") || s.includes("moderate")) return 60;
  return 60;
}

function asPoints(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((p) => String(p || "").trim()).filter(Boolean);
}

function asBlock(v: unknown, fallback = ""): DetailBlock {
  if (!v || typeof v !== "object") return { summary: fallback, points: [] };
  const o = v as { summary?: unknown; points?: unknown };
  return { summary: String(o.summary || fallback), points: asPoints(o.points) };
}

function asPlan(v: unknown, title: string, fallback = ""): DetailPlan {
  if (!v || typeof v !== "object") return { title, description: fallback, points: [] };
  const o = v as { title?: unknown; description?: unknown; points?: unknown };
  return {
    title: String(o.title || title),
    description: String(o.description || fallback),
    points: asPoints(o.points),
  };
}

function parseDetail(data: Record<string, unknown>): ReportDetail {
  const wtd = (data.what_to_do && typeof data.what_to_do === "object" ? data.what_to_do : {}) as Record<string, unknown>;
  const outlook = String(data.market_outlook || data.summary || "");
  const strategy = String(wtd.summary || data.strategy || "");
  const invalidation = String(data.invalidation || "");
  return {
    market_outlook: outlook,
    moving_averages: asBlock(data.moving_averages),
    price_action: asBlock(data.price_action),
    what_to_do: {
      summary: strategy,
      buy_on_dip: asPlan(wtd.buy_on_dip, "Buy on Dip / Sell on Rally", strategy),
      breakout: asPlan(wtd.breakout, "Wait for Breakout Confirmation"),
      trailing_stop: asPlan(wtd.trailing_stop, "Trail Stop Loss", invalidation),
    },
  };
}

const FAST_HINT =
  "FAST MODE: Fill every JSON section. Summaries 1-2 sentences. Still quote readable MA/price numbers. No fluff.";
const ADV_HINT =
  "ADVANCED MODE: Same JSON, deeper. Name every readable MA/RSI/MACD/volume overlay, swings, liquidity, wait vs act, precise invalidation.";

export async function analyzeChart(input: {
  images: string[];
  prompt: string;
  models: AiModel[];
  replyIn?: string;
  mode?: AnalysisMode;
}): Promise<AnalysisReport> {
  const images = await Promise.all(input.images.slice(0, 4).map((img) => compressImage(img)));
  const mode = input.mode || "fast";
  const selected: AiModel[] = ["gpt"];
  const modeHint = mode === "fast" ? FAST_HINT : ADV_HINT;
  const prompt = [input.replyIn, modeHint, input.prompt].filter(Boolean).join("\n\n");
  const payload = { images, prompt, models: selected };

  const res = await fetch("/api/analyze", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Analysis failed");
  const data = json as Record<string, unknown>;
  const insights = (data.key_insights && typeof data.key_insights === "object" ? data.key_insights : data) as Record<
    string,
    unknown
  >;
  const detail = parseDetail(data);
  const maPts = detail.moving_averages.points;
  const paPts = detail.price_action.points;

  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    imageDataUrl: images[0],
    prompt: input.prompt,
    models: selected,
    mode,
    title: String(data.title || "Chart snapshot"),
    confidence: asConfidence(data.confidence, insights.confidence),
    trend: asBias(insights.trend ?? data.trend),
    volatility: asVol(insights.volatility ?? data.volatility),
    volume: asVolume(insights.volume ?? data.volume),
    sentiment: asBias(insights.sentiment ?? data.sentiment),
    strategy: detail.what_to_do.summary,
    summary: detail.market_outlook,
    patterns: paPts.length
      ? paPts.map((note, i) => ({ name: i === 0 ? "Price action" : `Level ${i}`, note }))
      : Array.isArray(data.patterns)
        ? (data.patterns as { name?: string; note?: string }[]).map((p) => ({
            name: p.name || "Pattern",
            note: p.note || "",
          }))
        : [],
    indicators: maPts.length
      ? maPts.map((note, i) => ({ name: i === 0 ? "MA" : "MA note", reading: "", note }))
      : Array.isArray(data.indicators)
        ? (data.indicators as { name?: string; reading?: string; note?: string }[]).map((p) => ({
            name: p.name || "Indicator",
            reading: String(p.reading || ""),
            note: p.note || "",
          }))
        : [],
    synthesis: Array.isArray(data.synthesis) ? (data.synthesis as AnalysisReport["synthesis"]) : [],
    invalidation: String(data.invalidation || detail.what_to_do.trailing_stop.points[0] || ""),
    bookmarked: false,
    notes: Array.isArray(data.warnings) && data.warnings.length ? `Model notes: ${(data.warnings as string[]).join(" · ")}` : "",
    followUps: [],
    detail,
  };
}
