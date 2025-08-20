// api/modo-checkout.js
import { getModoToken } from "./_modoToken";

export default async function handler(req, res) {
  // CORS para Shopify Thank-you
  res.setHeader("Access-Control-Allow-Origin", "https://checkout.shopify.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  try {
    const { orderId, amount_cents, currency = "ARS", customer = {}, items = [] } = req.body || {};
    if (!orderId || !amount_cents) return res.status(400).json({ error: "Faltan orderId o amount_cents" });

    const BASE       = process.env.MODO_BASE_URL;            // PROD
    const PROCESSOR  = process.env.MODO_PROCESSOR_CODE;      // P1962
    const CC_CODE    = process.env.MODO_CC_CODE || "1CSI";   // cuotas
    const UA         = process.env.MODO_USER_AGENT || "MIMO";
    const WEBHOOK    = process.env.MODO_WEBHOOK_URL;         // tu webhook (si lo usás)

    // 1) Tomar token (cacheado)
    const access_token = await getModoToken();

    // 2) Armar body de Payment Request (MODO)
    const amount = Number((Number(amount_cents) / 100).toFixed(2));
    const externalId = `${orderId}-${Date.now()}`;
    const prBody = {
      description: `Pedido Shopify #${orderId}`,
      amount,
      currency,
      cc_code: CC_CODE,
      processor_code: PROCESSOR,
      external_intention_id: externalId,
      webhook_notification: WEBHOOK,
      message: `Shopify order ${orderId}`,
      customer: {
        full_name: customer.full_name || "Cliente",
        email: customer.email || "cliente@example.com",
        identification: customer.identification || "00000000",
        birth_date: customer.birth_date || "1990-01-01",
        phone: customer.phone || "+540000000000",
        id: customer.id || `shopify-${orderId}`,
        invoice_address: customer.invoice_address || {
          state: "Buenos Aires", city: "CABA", zip_code: "1000", street: "S/N", number: "0",
        },
      },
      items: (Array.isArray(items) && items.length) ? items : [{
        description: `Pedido Shopify #${orderId}`,
        quantity: 1,
        unit_price: amount,
        image: "https://via.placeholder.com/150",
        category_name: "Shopify",
        sku: String(orderId),
      }],
    };

    // 3) Crear Payment Request en MODO (PROD)
    const r = await fetch(`${BASE}/v2/payment-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        "Authorization": `Bearer ${access_token}`,
      },
      body: JSON.stringify(prBody),
    });

    const raw = await r.text();
    if (!r.ok) throw new Error(`PaymentRequest error ${r.status}: ${raw}`);

    const data = JSON.parse(raw); // { id, qr, deeplink, ... }

    // 4) Responder al front
    return res.status(200).json({
      id: data.id,
      qr: data.qr || data.qrString,
      deeplink: data.deeplink,
    });
  } catch (err) {
    console.error("modo-checkout error:", err);
    return res.status(500).json({ error: "Fallo creando payment-intention", detail: String(err.message || err) });
  }
}
