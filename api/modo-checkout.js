// /pages/api/modo-checkout.js
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // 1) Sanitizar envs por si hay guiones raros/espacios NBSP
    const clean = (s) =>
      (s || "")
        .replace(/\u2010|\u2011|\u2012|\u2013|\u2014/g, "-")
        .replace(/\u00A0/g, " ")
        .trim();

    const BASE = clean(process.env.MODO_BASE_URL); // https://merchants.preprod.playdigital.com.ar
    const USER = clean(process.env.MODO_USERNAME);
    const PASS = clean(process.env.MODO_PASSWORD);
    const PROC = clean(process.env.MODO_PROCESSOR_CODE); // P1018
    const CC   = clean(process.env.MODO_CC_CODE);        // 1CSI
    const UA   = process.env.MODO_USER_AGENT || "MIMO";

    // Validación simple
    if (!BASE || !USER || !PASS || !PROC || !CC) {
      return res.status(500).json({ error: "Faltan variables MODO_*" });
    }

    const { amount_cents, amount, currency = "ARS", description = "Pedido Gardenlife", external_intention_id } = req.body || {};

    // MODO espera amount float con 2 decimales. Admitimos cents o float.
    const amt = typeof amount === "number"
      ? Number(amount.toFixed(2))
      : (typeof amount_cents === "number" ? Number((amount_cents / 100).toFixed(2)) : null);

    if (amt === null) {
      return res.status(400).json({ error: "Enviá amount_cents (entero) o amount (float)" });
    }

    const extId = external_intention_id || `order-${Date.now()}`;

    // ========================
    // 1) Pedir TOKEN a MODO
    // ========================
    const tokenResp = await fetch(`${BASE}/v2/auth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
      },
      body: JSON.stringify({
        username: USER,
        password: PASS,
      }),
    });

    if (!tokenResp.ok) {
      const txt = await tokenResp.text();
      return res.status(502).json({ error: "Auth 401/4xx en MODO", detail: txt });
    }

    const { access_token } = await tokenResp.json();
    if (!access_token) {
      return res.status(502).json({ error: "MODO no devolvió access_token" });
    }

    // ==============================
    // 2) Crear PAYMENT REQUEST
    // ==============================
    const prBody = {
      description,
      amount: amt,            // float con 2 decimales
      currency,               // "ARS"
      cc_code: CC,            // "1CSI"
      processor_code: PROC,   // "P1018"
      external_intention_id: extId,
      // opcionales:
      // webhook_notification: "https://tu-dominio/api/modo-webhook",
      // message: "Mensaje que viaja al webhook",
      // customer, shipping_address, items...
    };

    const prResp = await fetch(`${BASE}/v2/payment-requests/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        "Authorization": `Bearer ${access_token}`,
      },
      body: JSON.stringify(prBody),
    });

    const text = await prResp.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (!prResp.ok) {
      return res.status(prResp.status).json({
        error: "Error creando Payment Request",
        status: prResp.status,
        detail: json
      });
    }

    // OK → devolver ID y deeplink al frontend
    return res.status(201).json({
      payment_request: json, // suele traer id, deeplink, expiration_date, etc.
    });

  } catch (e) {
    return res.status(500).json({ error: "Fallo servidor", detail: String(e?.message || e) });
  }
}
