// send-webhook.js  (test de aprobado)
import fetch from "node-fetch";

const WEBHOOK_URL = process.env.WEBHOOK_URL; // ej: https://TU.vercel.app/api/modo-webhook

(async () => {
  const payload = {
    status: "ACCEPTED",
    amount: "123.45",
    currency: "ARS",
    payment_id: "p_test_001",
    authorization_code: "AUTH123",
    // ✅ ahora probamos con external_intention_id (by the book)
    external_intention_id: "#1001"
  };

  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  console.log(res.status, await res.text());
})();

