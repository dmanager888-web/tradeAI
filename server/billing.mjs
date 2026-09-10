import {
  getUserById,
  publicUser,
  setPlayPurchase,
  setPremiumUntil,
} from "./db.mjs";

const PACKAGE = "com.analystradeai.app";

const PRODUCTS = {
  premium_month: { days: 30 },
  premium_year: { days: 365 },
};

async function expiryFromGoogle(env, productId, purchaseToken) {
  try {
    const keyFile = String(env.GOOGLE_PLAY_SERVICE_ACCOUNT || "").trim();
    if (!keyFile) return null;
    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth({
      keyFile,
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });
    const client = await auth.getClient();
    const { token } = await client.getAccessToken();
    const url =
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}` +
      `/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const data = await res.json();
    const expiry = Number(data.expiryTimeMillis);
    return expiry || null;
  } catch {
    return null;
  }
}

export async function activateGooglePlay(env, user, body) {
  const productId = String(body.productId || "");
  const purchaseToken = String(body.purchaseToken || "");
  if (!PRODUCTS[productId] || purchaseToken.length < 20) throw new Error("bad_purchase");
  const until = await expiryFromGoogle(env, productId, purchaseToken);
  if (!until) throw new Error("bad_purchase");
  setPlayPurchase(user.id, purchaseToken, productId);
  setPremiumUntil(user.id, until);
  return publicUser(getUserById(user.id));
}

export async function activateAppleIap(_env, _user, _body) {
  throw new Error("bad_purchase");
}
