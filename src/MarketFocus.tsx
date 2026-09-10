import { useState } from "react";
import { Banknote, Bitcoin, CandlestickChart, Check } from "lucide-react";
import { useI18n } from "./I18nProvider";
import type { DictKey } from "./i18n";
import type { MarketFocus } from "./types";

const OPTIONS: { id: MarketFocus; label: DictKey; Icon: typeof Bitcoin; tone: string }[] = [
  { id: "crypto", label: "marketCrypto", Icon: Bitcoin, tone: "#f5b942" },
  { id: "stocks", label: "marketStocks", Icon: CandlestickChart, tone: "#3b82f6" },
  { id: "forex", label: "marketForex", Icon: Banknote, tone: "#22c55e" },
];

export function MarketFocusModal({
  onConfirm,
}: {
  onConfirm: (focus: MarketFocus, notify: boolean, fullscreen: boolean) => void;
}) {
  const { t } = useI18n();
  const [focus, setFocus] = useState<MarketFocus | null>(null);
  const [notify, setNotify] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <div className="market-overlay">
      <div className="market-card">
        <h2>{t("marketTitle")}</h2>
        <p>{t("marketSub")}</p>
        <div className="market-list">
          {OPTIONS.map(({ id, label, Icon, tone }) => (
            <button
              key={id}
              type="button"
              className={`market-row ${focus === id ? "on" : ""}`}
              onClick={() => setFocus(id)}
            >
              <span className="market-ico" style={{ color: tone }}>
                <Icon size={28} />
              </span>
              <span>{t(label)}</span>
            </button>
          ))}
        </div>
        <label className="market-check">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          {t("marketNotify")}
        </label>
        <label className="market-check">
          <input type="checkbox" checked={fullscreen} onChange={(e) => setFullscreen(e.target.checked)} />
          {t("marketFull")}
        </label>
        <button className="market-confirm" disabled={!focus} onClick={() => focus && onConfirm(focus, notify, fullscreen)}>
          <Check size={18} /> {t("marketConfirm")}
        </button>
      </div>
    </div>
  );
}
