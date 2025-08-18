// pages/api/payment-request.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Body que viene desde Shopify (o test manual en Postman)
    const { amount, external_id, description } = req.body;

    const response = await fetch(`${process.env.MODO_API_URL}/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-username": process.env.MODO_USERNAME,
        "x-password": process.env.MODO_PASSWORD,
        "x-processor": process.env.MODO_PROCESSOR_CODE
      },
      body: JSON.stringify({
        amount: amount || 100, // default para test
        currency: "ARS",
        external_id: external_id || `order-${Date.now()}`,
        description: description || "Test desde Shopify"
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Error MODO:", data);
      return res.status(400).json({ error: "Error creando checkout", details: data });
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
