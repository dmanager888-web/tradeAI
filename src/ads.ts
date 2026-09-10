export const TEST_ADS = {
  appId: "ca-app-pub-3940256099942544~3347511713",
  banner: "ca-app-pub-3940256099942544/6300978111",
  interstitial: "ca-app-pub-3940256099942544/1033173712",
};

export function adIds() {
  return {
    appId: import.meta.env.VITE_ADMOB_APP_ID || TEST_ADS.appId,
    banner: import.meta.env.VITE_ADMOB_BANNER || TEST_ADS.banner,
    interstitial: import.meta.env.VITE_ADMOB_INTERSTITIAL || TEST_ADS.interstitial,
    adsense: import.meta.env.VITE_ADSENSE_CLIENT || "",
  };
}

export function loadAdsense(client: string) {
  if (!client || document.getElementById("adsense-sdk")) return;
  const s = document.createElement("script");
  s.id = "adsense-sdk";
  s.async = true;
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  s.crossOrigin = "anonymous";
  document.head.appendChild(s);
}
