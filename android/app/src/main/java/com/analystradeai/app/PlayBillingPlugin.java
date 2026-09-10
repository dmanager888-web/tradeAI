package com.analystradeai.app;

import androidx.annotation.NonNull;
import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Collections;
import java.util.List;

@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin {
    private BillingClient billingClient;
    private PluginCall pending;

    private void ensureClient(Runnable ready, PluginCall call) {
        if (billingClient != null && billingClient.isReady()) {
            ready.run();
            return;
        }
        billingClient =
            BillingClient.newBuilder(getActivity())
                .setListener(this::onPurchasesUpdated)
                .enablePendingPurchases()
                .build();
        billingClient.startConnection(
            new BillingClientStateListener() {
                @Override
                public void onBillingSetupFinished(@NonNull BillingResult result) {
                    if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        ready.run();
                    } else {
                        call.reject(result.getDebugMessage());
                    }
                }

                @Override
                public void onBillingServiceDisconnected() {}
            }
        );
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null || productId.isEmpty()) {
            call.reject("bad_product");
            return;
        }
        pending = call;
        ensureClient(() -> queryAndLaunch(productId, call), call);
    }

    @PluginMethod
    public void restore(PluginCall call) {
        ensureClient(
            () ->
                billingClient.queryPurchasesAsync(
                    QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
                    (result, purchases) -> {
                        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                            call.reject(result.getDebugMessage());
                            return;
                        }
                        JSArray list = new JSArray();
                        for (Purchase p : purchases) {
                            if (p.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
                            acknowledge(p);
                            JSObject row = new JSObject();
                            row.put("purchaseToken", p.getPurchaseToken());
                            row.put("productId", p.getProducts().isEmpty() ? "" : p.getProducts().get(0));
                            row.put("orderId", p.getOrderId());
                            list.put(row);
                        }
                        JSObject out = new JSObject();
                        out.put("purchases", list);
                        call.resolve(out);
                    }
                ),
            call
        );
    }

    private void queryAndLaunch(String productId, PluginCall call) {
        QueryProductDetailsParams.Product product =
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.SUBS)
                .build();
        QueryProductDetailsParams params =
            QueryProductDetailsParams.newBuilder().setProductList(Collections.singletonList(product)).build();
        billingClient.queryProductDetailsAsync(
            params,
            (result, detailsList) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || detailsList.isEmpty()) {
                    pending = null;
                    call.reject("product_not_found");
                    return;
                }
                ProductDetails details = detailsList.get(0);
                List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
                if (offers == null || offers.isEmpty()) {
                    pending = null;
                    call.reject("no_offer");
                    return;
                }
                BillingFlowParams.ProductDetailsParams offerParams =
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(details)
                        .setOfferToken(offers.get(0).getOfferToken())
                        .build();
                BillingFlowParams flow =
                    BillingFlowParams.newBuilder()
                        .setProductDetailsParamsList(Collections.singletonList(offerParams))
                        .build();
                BillingResult launched = billingClient.launchBillingFlow(getActivity(), flow);
                if (launched.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    pending = null;
                    call.reject(launched.getDebugMessage());
                }
            }
        );
    }

    private void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        PluginCall call = pending;
        pending = null;
        if (call == null) return;
        if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            call.reject("cancelled");
            return;
        }
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null || purchases.isEmpty()) {
            call.reject(result.getDebugMessage());
            return;
        }
        Purchase purchase = purchases.get(0);
        acknowledge(purchase);
        JSObject out = new JSObject();
        out.put("purchaseToken", purchase.getPurchaseToken());
        out.put("productId", purchase.getProducts().isEmpty() ? "" : purchase.getProducts().get(0));
        out.put("orderId", purchase.getOrderId());
        call.resolve(out);
    }

    private void acknowledge(Purchase purchase) {
        if (purchase.isAcknowledged()) return;
        AcknowledgePurchaseParams params =
            AcknowledgePurchaseParams.newBuilder().setPurchaseToken(purchase.getPurchaseToken()).build();
        billingClient.acknowledgePurchase(params, billingResult -> {});
    }
}
