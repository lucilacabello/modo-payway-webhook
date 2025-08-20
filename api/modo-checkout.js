// /api/modo-checkout.js
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const {
      orderId,
      amount,
      amount_cents,
      currency = "ARS",
      description = ""
    } = req.body || {};

    // --- Normalizar monto ---
    let amountFloat = null;
    if (typeof amount === "number") {
      amountFloat = amount;
    } else if (typeof amount_cents === "number") {
      amountFloat = amount_cents / 100;
    }

    if (!orderId || !amountFloat) {
      return res.status(400).json({ error: "Falta orderId o amount_cents" });
    }

    amountFloat = Number(amountFloat.toFixed(2));

    // --- Variables de entorno ---
    const BASE = process.env.MODO_BASE_URL;                          // https://merchants.playdigital.com.ar
    const USER = process.env.MODO_USERNAME;                          // GARDENLIFESA-373602-production
    const PASS = process.env.MODO_PASSWORD;                          // 373602-xYbyM9i16JEE
    const PROCESSOR = process.env.MODO_PROCESSOR_CODE || "P1962";    // P1962
    const CC_CODE = process.env.MODO_CC_CODE || "1CSI";              // 1CSI
    const UA = process.env.MODO_USER_AGENT || USER;                  // User-Agent

    // --- Paso 1: Obtener token ---
    const tokRes = await fetch(`${BASE}/v2/stores/companies/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ username: USER, password: PASS }),
    });
    const tokJson = await tokRes.json();
    if (!tokRes.ok) {
      return res.status(tokRes.status).json({ step: "token", detail: tokJson });
    }
    const token = tokJson.access_token;

    // --- Paso 2: Crear Payment Request ---
    const prRes = await fetch(`${BASE}/v2/payment-requests/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        description: description || `Pedido ${orderId}`,
        amount: Number(amountFloat.toFixed(2)),  // <-- ahora sí como número
        currency,
        cc_code: CC_CODE,
        processor_code: PROCESSOR,
        external_intention_id: String(orderId), // único
      }),
    });

    const prJson = await prRes.json();
    if (!prRes.ok) {
      return res.status(prRes.status).json({ step: "payment_request", detail: prJson });
    }

    // --- Respuesta final ---
    return res.status(200).json({
      id: prJson.id,
      qr: prJson.qr,
      deeplink: prJson.deeplink,
    });

  } catch (e) {
    console.error("ERROR /api/modo-checkout:", e);
    return res.status(500).json({ error: "Server error", detail: String(e) });
  }
}
