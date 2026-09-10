import Capacitor
import StoreKit

@objc(StoreBillingPlugin)
public class StoreBillingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreBillingPlugin"
    public let jsName = "StoreBilling"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise)
    ]

    @objc func purchase(_ call: CAPPluginCall) {
        let productId = call.getString("productId") ?? ""
        if productId.isEmpty {
            call.reject("bad_product")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("product_not_found")
                    return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    let transaction = try Self.unwrap(verification)
                    await transaction.finish()
                    call.resolve([
                        "productId": productId,
                        "purchaseToken": String(transaction.id),
                        "jws": verification.jwsRepresentation,
                    ])
                case .userCancelled:
                    call.reject("cancelled")
                case .pending:
                    call.reject("pending")
                @unknown default:
                    call.reject("unknown")
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    private static func unwrap<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified(_, let error):
            throw error
        case .verified(let value):
            return value
        }
    }
}
