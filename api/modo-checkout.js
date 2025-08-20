// /api/modo-checkout.js
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { orderId, amount, amount_cents, currency = "ARS", description = "" } = req.body || {};

    // Normalizar amount
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

    // armar payload de MODO
    const bodyPR = {
      description,
      amount: amountFloat,
      currency,
      cc_code: process.env.MODO_CC_CODE,
      processor_code: process.env.MODO_PROCESSOR_CODE,
      external_intention_id: orderId
    };

    console.log("Payload que mando a MODO:", bodyPR);

    // fetch a MODO...
    // ...
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
}

    const BASE = process.env.MODO_BASE_URL;                          // https://merchants.playdigital.com.ar
    const USER = process.env.MODO_USERNAME;                          // GARDENLIFESA-373602-production
    const PASS = process.env.MODO_PASSWORD;                          // 373602-xYbyM9i16JEE
    const PROCESSOR = process.env.MODO_PROCESSOR_CODE || 'P1962';    // P1962
    const CC_CODE = process.env.MODO_CC_CODE || '1CSI';              // 1CSI
    const UA = process.env.MODO_USER_AGENT || USER;                  // User-Agent

    // 1) Obtener token
    const tokRes = await fetch(`${BASE}/v2/stores/companies/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ username: USER, password: PASS }),
    });
    const tokJson = await tokRes.json();
    if (!tokRes.ok) {
      return res.status(tokRes.status).json({ step: 'token', detail: tokJson });
    }
    const token = tokJson.access_token;

    // 2) Crear Payment Request (IMPORTANTE: barra final)
    const prRes = await fetch(`${BASE}/v2/payment-requests/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UA,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        description: `Pedido ${orderId}`,
        amount: (amount_cents / 100).toFixed(2), // 100 => 1.00
        currency,
        cc_code: CC_CODE,
        processor_code: PROCESSOR,
        external_intention_id: String(orderId)   // debe ser único
        // Nota: no mandamos customer/items ahora para simplificar
      }),
    });

    const prJson = await prRes.json();
    if (!prRes.ok) {
      return res.status(prRes.status).json({ step: 'payment_request', detail: prJson });
    }

    // Listo: devolvemos lo que necesita el modal
    return res.status(200).json({
      id: prJson.id,
      qr: prJson.qr,
      deeplink: prJson.deeplink
    });
  } catch (e) {
    return res.status(500).json({ error: 'Server error', detail: String(e) });
  }
}
