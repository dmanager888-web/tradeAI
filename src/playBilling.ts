import { Capacitor, registerPlugin } from "@capacitor/core";
import { api } from "./api";
import type { SessionUser } from "./auth";

const PRODUCTS = {
  year: "premium_year",
  month: "premium_month",
} as const;

type NativePurchase = {
  purchase(options: { productId: string }): Promise<{
    purchaseToken: string;
    productId: string;
    orderId?: string;
    jws?: string;
  }>;
};

const PlayBilling = registerPlugin<NativePurchase>("PlayBilling");
const StoreBilling = registerPlugin<NativePurchase>("StoreBilling");

export async function startStorePurchase(plan: "year" | "month"): Promise<SessionUser> {
  const platform = Capacitor.getPlatform();
  const productId = PRODUCTS[plan];
  if (platform === "android") {
    const bought = await PlayBilling.purchase({ productId });
    const data = await api<{ user: SessionUser }>("/api/billing/google", {
      method: "POST",
      body: bought,
    });
    return data.user;
  }
  if (platform === "ios") {
    const bought = await StoreBilling.purchase({ productId });
    const data = await api<{ user: SessionUser }>("/api/billing/apple", {
      method: "POST",
      body: bought,
    });
    return data.user;
  }
  throw new Error("store_app_only");
}
