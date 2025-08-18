export default async function handler(req, res) {
  // Simple guard: poné un secreto en la URL ?s=TU_SECRETO
  const ok = process.env.DEBUG_SECRET && req.query.s === process.env.DEBUG_SECRET;
  if (!ok) return res.status(403).json({ error: "forbidden" });

  const BASE = process.env.MODO_BASE_URL;
  const USER = process.env.MODO_USERNAME;
  const PASS = process.env.MODO_PASSWORD;
  const UA   = process.env.MODO_USER_AGENT || "MIMO";

  try {
    const r = await fetch(`${BASE}/v2/stores/companies/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ username: USER, password: PASS }),
    });

    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}

    return res.status(200).json({
      request: { url: `${BASE}/v2/stores/companies/token`, ua: UA, user: USER },
      response: { status: r.status, ok: r.ok, body: json ?? text },
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
