export type TabId = "analyze" | "history" | "templates" | "profile";

export type MarketFocus = "crypto" | "stocks" | "forex";

export type AiModel = "gpt" | "gemini" | "claude" | "grok" | "llama" | "deepseek";

export type Bias = "bullish" | "bearish" | "neutral";

export type AnalysisMode = "fast" | "advanced";

export type FollowUp = { q: string; a: string };

export type DetailBlock = { summary: string; points: string[] };

export type DetailPlan = { title: string; description: string; points: string[] };

export type ReportDetail = {
  market_outlook: string;
  moving_averages: DetailBlock;
  price_action: DetailBlock;
  what_to_do: {
    summary: string;
    buy_on_dip: DetailPlan;
    breakout: DetailPlan;
    trailing_stop: DetailPlan;
  };
};

export type AnalysisReport = {
  id: string;
  createdAt: string;
  imageDataUrl: string;
  prompt: string;
  models: AiModel[];
  mode?: AnalysisMode;
  title: string;
  confidence: number;
  trend: Bias;
  volatility: "low" | "medium" | "high";
  volume: "weak" | "average" | "strong";
  sentiment: Bias;
  strategy: string;
  summary: string;
  patterns: { name: string; note: string }[];
  indicators: { name: string; reading: string; note: string }[];
  synthesis: { model: AiModel; view: string }[];
  invalidation: string;
  bookmarked: boolean;
  notes: string;
  followUps?: FollowUp[];
  detail?: ReportDetail;
};

export type PromptTemplate = {
  id: string;
  name: string;
  body: string;
};

export const MAX_INSTRUCTIONS = 5;
export const FREE_PROMPT_CHARS = 500;
export const PRO_PROMPT_CHARS = 2000;

export function promptCharLimit(premium: boolean) {
  return premium ? PRO_PROMPT_CHARS : FREE_PROMPT_CHARS;
}

export type PriceAlert = {
  id: string;
  title: string;
  condition: string;
  active: boolean;
};

export const MODEL_LABEL: Record<AiModel, string> = {
  gpt: "ChatGPT",
  gemini: "Gemini",
  claude: "Claude",
  grok: "Grok",
  llama: "Llama",
  deepseek: "DeepSeek",
};
