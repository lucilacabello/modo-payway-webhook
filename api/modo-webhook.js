// /api/modo-webhook.js
// Plan A: intentar /complete.json
// Plan B: si 406 (u otro), crear la Order directamente desde la Draft y borrar la Draft.

export default async function handler(req, res) {
  const trace = `W-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    }

    let payload = req.body ?? {};
    if (typeof payload === "string") {
      try { payload = JSON.parse(payload); } catch { payload = {}; }
    }

    console.log("[MODO][WEBHOOK][IN]", trace, JSON.stringify(payload));

    const status = String(payload.status || "").toUpperCase();
    const draft_id = payload?.metadata?.draft_id;
    if (!draft_id) {
      return res.status(400).json({ error: "MISSING_DRAFT_ID_IN_METADATA" });
    }
    if (status !== "APPROVED") {
      return res.status(200).json({ ok: true, ignored: true, status, draft_id });
    }

    const shop  = process.env.SHOPIFY_SHOP;
    const token = process.env.SHOPIFY_ADMIN_TOKEN;
    if (!shop || !token) {
      return res.status(500).json({ error: "ENV_MISSING_SHOPIFY" });
    }

    // -------- PLAN A: completar draft --------
    const completeUrl = `https://${shop}/admin/api/2024-10/draft_orders/${draft_id}/complete.json`;
    console.log("[SHOPIFY][DRAFT_COMPLETE][REQ]", trace, completeUrl);
    let resp = await fetch(completeUrl, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ payment_pending: false }) // ya cobrado por MODO
    });

    let data = {};
    try { data = await resp.json(); } catch {}

    console.log("[SHOPIFY][DRAFT_COMPLETE][RESP]", trace, resp.status, data);

    // Si completó bien, devolvemos OK
    if (resp.ok) {
      const orderId = data?.draft_order?.order_id || data?.order?.id;
      return res.status(200).json({ ok: true, completed: true, draft_id, order_id: orderId });
    }

    // Si fue 406 u otro problema → Plan B
    console.log("[WEBHOOK] Plan A falló, pasamos a Plan B (crear Order manual).", trace);

    // -------- PLAN B: crear Order desde la Draft --------
    // 1) Leer la draft completa
    const getDraftUrl = `https://${shop}/admin/api/2024-10/draft_orders/${draft_id}.json`;
    const dRes = await fetch(getDraftUrl, {
      headers: { "X-Shopify-Access-Token": token }
    });
    const dJson = await dRes.json();
    if (!dRes.ok) {
      return res.status(dRes.status).json({ error: "DRAFT_FETCH_FAIL", detail: dJson });
    }
    const draft = dJson.draft_order;

    // 2) Mapear line items para Orders API
    const orderLineItems = (draft.line_items || []).map(li => {
      // Si tiene variant_id, usamos eso. Si no, pasamos custom con título y precio.
      if (li.variant_id) {
        return {
          variant_id: li.variant_id,
          quantity: li.quantity || 1,
          price: li.price
        };
      }
      return {
        title: li.title || "Item",
        quantity: li.quantity || 1,
        price: li.price
      };
    });

    // 3) Armar Order
    const orderBody = {
      order: {
        email: draft.customer?.email || draft.email,
        customer: draft.customer ? { id: draft.customer.id, email: draft.customer.email } : undefined,
        line_items: orderLineItems,
        billing_address: draft.billing_address || draft.shipping_address || undefined,
        shipping_address: draft.shipping_address || undefined,
        tags: draft.tags || "modo, qr",
        note: draft.note || "Pago con MODO",
        financial_status: "paid", // la creamos ya pagada
        transactions: [
          {
            kind: "sale",
            status: "success",
            amount: String(draft.subtotal_price || draft.total_price || payload.amount || 0),
            gateway: "MODO"
          }
        ],
      }
    };

    const createOrderUrl = `https://${shop}/admin/api/2024-10/orders.json`;
    console.log("[SHOPIFY][ORDER_CREATE][REQ]", trace, createOrderUrl);
    const oRes = await fetch(createOrderUrl, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(orderBody)
    });
    const oJson = await oRes.json().catch(() => ({}));
    console.log("[SHOPIFY][ORDER_CREATE][RESP]", trace, oRes.status, oJson);

    if (!oRes.ok) {
      return res.status(oRes.status).json({ error: "ORDER_CREATE_FAIL", detail: oJson });
    }

    const orderId = oJson?.order?.id;

    // 4) (Opcional) borrar la Draft para no dejar duplicado
    try {
      const delUrl = `https://${shop}/admin/api/2024-10/draft_orders/${draft_id}.json`;
      const delRes = await fetch(delUrl, {
        method: "DELETE",
        headers: { "X-Shopify-Access-Token": token }
      });
      console.log("[SHOPIFY][DRAFT_DELETE][RESP]", trace, delRes.status);
    } catch (e) {
      console.warn("[SHOPIFY][DRAFT_DELETE][WARN]", trace, e?.message);
    }

    return res.status(200).json({ ok: true, completed: true, draft_id, order_id: orderId, via: "order_create" });
  } catch (e) {
    console.error("[WEBHOOK][EXCEPTION]", trace, e);
    return res.status(500).json({ error: "SERVER_ERROR", message: e.message, trace });
  }
}
