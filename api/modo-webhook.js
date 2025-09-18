// /api/modo-webhook.js
export default async function handler(req, res) {
  const trace = `W-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;

  try {
    if (req.method !== "POST") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });

    // --- payload ---
    let payload = req.body ?? {};
    if (typeof payload === "string") { try { payload = JSON.parse(payload); } catch { payload = {}; } }
    console.log("[MODO][IN]", trace, payload);

    const status   = String(payload.status || "").toUpperCase();
    const draft_id = payload?.metadata?.draft_id || payload?.draft_id;
    if (!draft_id) return res.status(400).json({ error: "MISSING_DRAFT_ID_IN_METADATA" });
    if (status !== "APPROVED") return res.status(200).json({ ok: true, ignored: true, status, draft_id });

    // ENVs
    const shop     = process.env.SHOPIFY_SHOP;            // ej: cfafc3-c5.myshopify.com
    const token    = process.env.SHOPIFY_ADMIN_TOKEN;     // Admin API
    const version  = process.env.SHOPIFY_API_VERSION || "2025-07";
    if (!shop || !token) return res.status(500).json({ error: "ENV_MISSING_SHOPIFY", missing: { shop: !!shop, token: !!token } });

    // Helper de log
    const readResp = async (resp) => {
      const text = await resp.text();
      const headers = Object.fromEntries([...resp.headers.entries()]);
      const rid = headers["x-request-id"] || headers["x-shopify-request-id"] || null;
      console.log("[SHOPIFY][RESP]", trace, resp.status, { url: resp.url, rid, headers, body: text });
      return { ok: resp.ok, status: resp.status, text, headers, rid };
    };

    // ---- Intento A: body JSON ----
    const urlA = `https://${shop}/admin/api/${version}/draft_orders/${draft_id}/complete.json`;
    console.log("[SHOPIFY][REQ:A]", trace, urlA);
    let resp = await fetch(urlA, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ payment_pending: false })
    });
    let A = await readResp(resp);

    // Si falla 406/4xx, intentamos Variante B (querystring, sin body)
    if (!A.ok) {
      const urlB = `https://${shop}/admin/api/${version}/draft_orders/${draft_id}/complete.json?payment_pending=false`;
      console.log("[SHOPIFY][REQ:B]", trace, urlB);
      resp = await fetch(urlB, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": token,
          "Accept": "application/json"
          // sin Content-Type porque no hay body
        }
      });
      var B = await readResp(resp);
      if (B.ok) A = B;
    }

    // ¿ya estaba completada?
    const bodyStr = (A?.text || "").toLowerCase();
    if (!A.ok && bodyStr.includes("already been completed")) {
      return res.status(200).json({ ok: true, already_completed: true, draft_id, request_id: A.rid });
    }

    if (!A.ok) {
      return res.status(A.status).json({
        error: "SHOPIFY_DRAFT_COMPLETE_FAILED",
        status: A.status,
        request_id: A.rid,
        response_headers: A.headers,
        body: A.text
      });
    }

    // Parseamos si vino JSON; si no, devolvemos raw
    let data; try { data = JSON.parse(A.text); } catch { data = { raw: A.text }; }
    const orderId = data?.draft_order?.order_id || data?.order?.id || null;

    return res.status(200).json({
      ok: true,
      completed: true,
      draft_id,
      order_id: orderId,
      request_id: A.rid,
      api_version: version,
      data
    });
  } catch (e) {
    console.error("[WEBHOOK][EXCEPTION]", trace, e);
    return res.status(500).json({ error: "SERVER_ERROR", message: e?.message, trace });
  }
}
