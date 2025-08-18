export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "https://checkout.shopify.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  try {
    const { orderId, amount_cents, currency = "ARS", customer = {}, items = [] } = req.body || {};
    if (!orderId || !amount_cents) return res.status(400).json({ error: "Faltan orderId o amount_cents" });

    const BASE = process.env.MODO_BASE_URL;
    const USER = process.env.MODO_USERNAME;
    const PASS = process.env.MODO_PASSWORD;
    const PROCESSOR = process.env.MODO_PROCESSOR_CODE;
    const CC_CODE = process.env.MODO_CC_CODE || "1CSI";
    const UA = process.env.MODO_USER_AGENT || "MIMO";
    const WEBHOOK = process.env.MODO_WEBHOOK_URL;

    // 1) TOKEN
    const tokRes = await fetch(`${BASE}/v2/stores/companies/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ username: USER, password: PASS }),
    });
    const tokTxt = await tokRes.text();
    if (!tokRes.ok) throw new Error(`Token error: ${tokRes.status} ${tokTxt}`);
    const { access_token } = JSON.parse(tokTxt);

    // 2) PAYMENT REQUEST
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
        full_name: customer.full_name || "Cliente Tester",
        email: customer.email || "cliente@test.com",
        identification: customer.identification || "12345678",
        birth_date: customer.birth_date || "1990-01-01",
        phone: customer.phone || "+541100000000",
        id: customer.id || `shopify-${orderId}`,
        invoice_address: customer.invoice_address || {
          state: "Buenos Aires", city: "CABA", zip_code: "1000", street: "Falsa", number: "123",
        },
      },
      items: Array.isArray(items) && items.length ? items : [{
        description: `Pedido Shopify #${orderId}`, quantity: 1, unit_price: amount,
        image: "https://via.placeholder.com/150", category_name: "Shopify", sku: String(orderId),
      }],
    };

    const prRes = await fetch(`${BASE}/v2/payment-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        "Authorization": `Bearer ${access_token}`,
      },
      body: JSON.stringify(prBody),
    });
    const prTxt = await prRes.text();
    if (!prRes.ok) throw new Error(`PaymentRequest error: ${prRes.status} ${prTxt}`);
    const data = JSON.parse(prTxt);

    return res.status(200).json({ id: data.id, qr: data.qr || data.qrString, deeplink: data.deeplink });
  } catch (err) {
    console.error("modo-checkout error:", err);
    return res.status(500).json({ error: "Fallo creando payment-intention", detail: String(err.message || err) });
  }
}
