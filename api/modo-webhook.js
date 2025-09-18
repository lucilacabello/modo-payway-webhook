// /api/modo-webhook.js
// Completa la Draft Order en Shopify cuando MODO envía APPROVED.

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    }

    // Para pruebas: permití llamadas sin firma
    const allowUnsigned = String(process.env.ALLOW_UNSIGNED_WEBHOOKS || "").toLowerCase() === "true";

    // TODO: si quisieras validar firma/JWT de MODO, hacelo acá.
    if (!allowUnsigned) {
      // return res.status(401).json({ error: "SIGNATURE_REQUIRED" });
    }

    const payload = req.body || {};
    console.log("[MODO][WEBHOOK] payload:", JSON.stringify(payload));

    const status = String(payload.status || "").toUpperCase();
    const draft_id = payload?.metadata?.draft_id; // 👈 viene desde payment-request

    if (!draft_id) {
      return res.status(400).json({ error: "MISSING_DRAFT_ID_IN_METADATA" });
    }

    if (status !== "APPROVED") {
      // Para otros estados, no hacemos nada (idempotente)
      return res.status(200).json({ ok: true, ignored: true, status, draft_id });
    }

    // === Completar la draft en Shopify ===
    const shop  = process.env.SHOPIFY_SHOP;
    const token = process.env.SHOPIFY_ADMIN_TOKEN;
    if (!shop || !token) {
      return res.status(500).json({ error: "ENV_MISSING_SHOPIFY" });
    }

    // Marcamos como pagada (payment_pending: false) y con gateway "MODO"
    const resp = await fetch(`https://${shop}/admin/api/2024-10/draft_orders/${draft_id}/complete.json`, {
      method: "PUT", // Shopify acepta PUT para /complete.json
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        payment_pending: false,
        payment_gateway: "MODO"
      })
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      // Si ya estaba completada, lo tratamos como éxito idempotente
      const msg = (data && (data.errors || data.error)) || data;
      const already = JSON.stringify(msg || "").includes("has already been completed");
      if (already) {
        console.log("[SHOPIFY][DRAFT_COMPLETE][ALREADY]", { draft_id });
        return res.status(200).json({ ok: true, already_completed: true, draft_id });
      }
      console.error("[SHOPIFY][DRAFT_COMPLETE][ERROR]", { status: resp.status, data });
      return res.status(resp.status).json({ error: "DRAFT_COMPLETE_FAIL", detail: data });
    }

    const orderId = data?.draft_order?.order_id || data?.order?.id;
    console.log("[SHOPIFY][DRAFT_COMPLETE][OK]", { draft_id, order_id: orderId });

    return res.status(200).json({ ok: true, completed: true, draft_id, order_id: orderId });
  } catch (e) {
    console.error("[WEBHOOK_ERROR]", e);
    return res.status(500).json({ error: "SERVER_ERROR", message: e.message });
  }
};


