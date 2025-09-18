// /api/modo-webhook.js
// Webhook de MODO: completa Draft Order cuando status === "APPROVED"

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

async function completeDraft(draftId) {
  const shop = process.env.SHOPIFY_SHOP;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  if (!shop || !token) {
    throw new Error("ENV_MISSING_SHOPIFY_SHOP_OR_TOKEN");
  }

  const url = `https://${shop}/admin/api/2024-10/draft_orders/${draftId}/complete.json`;

  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      payment_pending: false, // ya está pago por MODO
      payment_gateway: "MODO",
    }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = `[SHOPIFY][DRAFT_COMPLETE][ERR] ${resp.status}`;
    console.error(msg, data);
    throw new Error(`${msg}`);
  }

  return data; // incluye order creada
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    }

    const allowUnsigned =
      String(process.env.ALLOW_UNSIGNED_WEBHOOKS || "")
        .toLowerCase() === "true";

    // TODO: si después validás firma/JWT, hacelo acá.
    if (!allowUnsigned) {
      return res.status(400).json({ error: "SIGNATURE_REQUIRED" });
    }

    const payload = req.body || {};
    console.error("[MODO][WEBHOOK] payload:", JSON.stringify(payload));

    const status = String(payload.status || "").toUpperCase();
    const draftId =
      payload?.metadata?.draft_id ||
      payload?.metadata?.draftId ||
      payload?.metadata?.draftID;

    if (status === "APPROVED") {
      if (!draftId) {
        console.error("[MODO][WEBHOOK] Falta metadata.draft_id");
        return res.status(200).json({
          ok: true,
          note: "APPROVED sin draft_id; no se completó Draft",
        });
      }

      try {
        const result = await completeDraft(draftId);
        const orderId = result?.order?.id || null;
        console.error("[SHOPIFY][DRAFT_COMPLETE][OK]", {
          draft_id: draftId,
          order_id: orderId,
        });

        return res.status(200).json({
          ok: true,
          action: "draft_completed",
          draft_id: draftId,
          order_id: orderId,
        });
      } catch (e) {
        // responder 500 hace que MODO reintente el webhook
        return res.status(500).json({
          ok: false,
          error: "DRAFT_COMPLETE_FAIL",
          message: e?.message || String(e),
        });
      }
    }

    // Otros estados: ACCEPTED/REJECTED/PENDING...
    return res.status(200).json({ ok: true, status, note: "no-op" });
  } catch (e) {
    console.error("[MODO][WEBHOOK][ERROR]", e);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: e?.message || String(e),
    });
  }
}

}

