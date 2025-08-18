// api/modo-checkout.js

export default async function handler(req, res) {
  // ====== CORS ======
  res.setHeader("Access-Control-Allow-Origin", "https://checkout.shopify.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end(); // Preflight OK
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const { orderId, amount_cents, currency } = req.body;

    // 🔑 TODO: Cambiar por tus credenciales PREPROD
    const siteId = process.env.MODO_SITE_ID;
    const apiKey = process.env.MODO_API_KEY;
    const processorCode = "PAYWAY"; // siempre PAYWAY si usás Payway como gateway

    // 🚀 Llamada a la API PREPROD de MODO para crear payment-request
    const response = await fetch("https://ecommerce.preprod.modo.com.ar/api/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`, // si MODO te da token
      },
      body: JSON.stringify({
        siteId,
        processor: processorCode,
        amount: amount_cents,
        currency,
        externalId: orderId.toString(), // para mapear luego en el webhook
      }),
    });

    if (!response.ok) {
      const txt = await response.text();
      throw new Error("Error creando checkout en MODO: " + txt);
    }

    const data = await response.json();

    // 🔙 Lo que espera el frontend
    return res.status(200).json({
      id: data.id || data.checkoutId,
      qr: data.qrString,
      deeplink: data.deeplink,
    });
  } catch (err) {
    console.error("modo-checkout error:", err);
    return res.status(500).json({ error: "Fallo creando payment-intention", detail: err.message });
  }
}
