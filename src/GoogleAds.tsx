import { useEffect, useState } from "react";
import { adIds, loadAdsense } from "./ads";
import { useI18n } from "./I18nProvider";

export function GoogleAdBanner({ onUpgrade }: { onUpgrade: () => void }) {
  const { t } = useI18n();
  const ids = adIds();
  useEffect(() => {
    if (!ids.adsense) return;
    loadAdsense(ids.adsense);
    try {
      ((window as unknown as { adsbygoogle: unknown[] }).adsbygoogle ||= []).push({});
    } catch {
      /* ignore */
    }
  }, [ids.adsense]);

  return (
    <div className="ad-wrap">
      <div className="ad-label">
        Ad · Google
        <button type="button" onClick={onUpgrade}>
          {t("removePro")}
        </button>
      </div>
      {ids.adsense ? (
        <ins
          className="adsbygoogle"
          style={{ display: "block" }}
          data-ad-client={ids.adsense}
          data-ad-slot={ids.banner}
          data-ad-format="horizontal"
          data-full-width-responsive="true"
        />
      ) : (
        <a className="ad-test" href="https://admob.google.com/" target="_blank" rel="noreferrer">
          <b>{t("testAd")}</b>
          <span>Google AdMob · banner {ids.banner}</span>
        </a>
      )}
    </div>
  );
}

export function InterstitialAd({ onClose, onUpgrade }: { onClose: () => void; onUpgrade: () => void }) {
  const { t } = useI18n();
  const [left, setLeft] = useState(3);
  useEffect(() => {
    const tmr = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(tmr);
  }, []);

  return (
    <div className="ad-modal">
      <div className="ad-modal-card">
        <div className="ad-label">Ad · Google Interstitial</div>
        <div className="ad-test tall">
          <b>{t("testAd")}</b>
          <span>{t("adAfter")}</span>
        </div>
        <div className="actions">
          <button className="btn ghost" disabled={left > 0} onClick={onClose}>
            {left > 0 ? `${t("close")} ${left}` : t("close")}
          </button>
          <button className="btn primary" onClick={onUpgrade}>
            {t("proNoAds")}
          </button>
        </div>
      </div>
    </div>
  );
}
