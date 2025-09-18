// /api/modo-webhook.js (ESM)
// Completa la Draft Order en Shopify cuando MODO envía APPROVED.

export default async function handler(req, res) {
  const trace = `W-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    }

    // Body puede venir string o parseado; normalizamos:
    let payload = req.body ?? {};
    if (typeof payload === "string") {
      try { payload = JSON.parse(payload); } catch { payload = {}; }
    }

    console.log("[MODO][WEBHOOK][IN]", trace, JSON.stringify(payload));

    const allowUnsigned = String(process.env.ALLOW_UNSIGNED_WEBHOOKS || "").toLowerCase() === "true";
    if (!allowUnsigned) {
      // TODO: validar firma/JWT de MODO
      // return res.status(401).json({ error: "SIGNATURE_REQUIRED" });
    }

    const status = String(payload.status || "").toUpperCase();
    const draft_id = payload?.metadata?.draft_id;

    if (!draft_id) {
      console.error("[WEBHOOK][ERR] falta metadata.draft_id", trace);
      return res.status(400).json({ error: "MISSING_DRAFT_ID_IN_METADATA" });
    }

    if (status !== "APPROVED") {
      console.log("[WEBHOOK] estado no manejado (idempotente):", status, trace);
      return res.status(200).json({ ok: true, ignored: true, status, draft_id });
    }

    const shop  = process.env.SHOPIFY_SHOP;
    const token = process.env.SHOPIFY_ADMIN_TOKEN;

    const missing = [];
    if (!shop)  missing.push("SHOPIFY_SHOP");
    if (!token) missing.push("SHOPIFY_ADMIN_TOKEN");
    if (missing.length) {
      console.error("[WEBHOOK][ENV_MISSING]", missing, trace);
      return res.status(500).json({ error: "ENV_MISSING_SHOPIFY", missing });
    }

    const url  = `https://${shop}/admin/api/2024-10/draft_orders/${draft_id}/complete.json`;
    const body = { payment_pending: false, payment_gateway: "MODO" };

    console.log("[SHOPIFY][DRAFT_COMPLETE][REQ]", trace, url, body);

    const resp = await fetch(url, {
      method: "POST", // /complete.json es POST
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    let data = {};
    try { data = await resp.json(); } catch {}

    console.log("[SHOPIFY][DRAFT_COMPLETE][RESP]", trace, resp.status, data);

    if (!resp.ok) {
      const msg = (data && (data.errors || data.error)) || data;
      const already = JSON.stringify(msg || "").includes("has already been completed");
      if (already) {
        console.log("[SHOPIFY][DRAFT_COMPLETE][ALREADY]", trace, { draft_id });
        return res.status(200).json({ ok: true, already_completed: true, draft_id });
      }
      return res.status(resp.status).json({ error: "DRAFT_COMPLETE_FAIL", detail: data });
    }

    const orderId = data?.draft_order?.order_id || data?.order?.id;
    console.log("[SHOPIFY][DRAFT_COMPLETE][OK]", trace, { draft_id, order_id: orderId });

    return res.status(200).json({ ok: true, completed: true, draft_id, order_id: orderId });
  } catch (e) {
    console.error("[WEBHOOK][EXCEPTION]", trace, e);
    return res.status(500).json({ error: "SERVER_ERROR", message: e.message, trace });
  }
}
