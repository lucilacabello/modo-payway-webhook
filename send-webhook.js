/**
 * Simple test sender (local): node test/send-webhook.js
 * NOTE: Only for local/manual tests. In Vercel, use curl as in README.
 */
import fetch from "node-fetch";

const url = process.env.WEBHOOK_URL || "http://localhost:3000/api/modo-webhook";
const payload = {
  status: "approved",
  amount: "12345.67",
  currency: "ARS",
  payment_id: "p_999999",
  external_reference: "123456789",
  authorization_code: "AUTH123"
};

async function main() {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  console.log(res.status, text);
}

main().catch(console.error);
