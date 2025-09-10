// send-webhook-rejected.js  (test de rechazo)
import fetch from "node-fetch";

const WEBHOOK_URL = process.env.WEBHOOK_URL;

(async () => {
  const payload = {
    status: "REJECTED",
    amount: "123.45",
    currency: "ARS",
    payment_id: "p_test_002",
    operation_error: "Insufficient funds",
    external_intention_id: "#1001"
  };

  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  console.log(res.status, await res.text());
})();
