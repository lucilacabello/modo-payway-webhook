// api/_modoToken.js
let cachedToken = null;      // { token: string, expiresAt: number(ms) }

export async function getModoToken() {
  // Si el token existe y le quedan > 60s, reutilizalo
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const BASE = process.env.MODO_BASE_URL; // prod: https://merchants.playdigital.com.ar
  const USER = process.env.MODO_USERNAME; // GARDENLIFESA-373602-production
  const PASS = process.env.MODO_PASSWORD; // 373602-xYbyM9i16JEE
  const UA   = process.env.MODO_USER_AGENT || "MIMO";

  const r = await fetch(`${BASE}/v2/stores/companies/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ username: USER, password: PASS }),
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Token error (${r.status}): ${txt}`);
  }

  const j = await r.json(); // { access_token, expires_in }
  cachedToken = {
    token: j.access_token,
    // expires_in viene en segundos → guardamos hora exacta de expiración
    expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}
