function asciiReport(label, str) {
  const codes = [];
  let nonAscii = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    codes.push(c);
    if (c < 32 || c > 126) nonAscii.push({ index: i, code: c });
  }
  return { label, length: str.length, hasNonAscii: nonAscii.length > 0, nonAscii };
}

export default async function handler(req, res) {
  const ok = process.env.DEBUG_SECRET && req.query.s === process.env.DEBUG_SECRET;
  if (!ok) return res.status(403).json({ error: "forbidden" });

  const BASE = process.env.MODO_BASE_URL;
  const RAW_USER = process.env.MODO_USERNAME || "";
  const RAW_PASS = process.env.MODO_PASSWORD || "";
  const RAW_UA   = process.env.MODO_USER_AGENT || "";

  // Variantes a probar
  const userWithSpace = RAW_USER;
  const userNoSpace   = RAW_USER.replace(/\s+/g, ""); // por si el backend no acepta espacios
  const passFixedDash = RAW_PASS.replace(/\u2013/g, "-"); // reemplaza guion largo EN DASH por guion ASCII

  const UAs = [ RAW_UA || "MIMO", "MIMO", "PLAYDIGITAL SA-318979-preprod" ];
  const attempts = [
    { name: "UA_env + user_con_espacio + pass_raw", ua: UAs[0], user: userWithSpace, pass: RAW_PASS },
    { name: "UA_MIMO + user_con_espacio + pass_raw", ua: UAs[1], user: userWithSpace, pass: RAW_PASS },
    { name: "UA_Merchant + user_con_espacio + pass_fixDash", ua: UAs[2], user: userWithSpace, pass: passFixedDash },
    { name: "UA_Merchant + user_sin_espacio + pass_fixDash", ua: UAs[2], user: userNoSpace, pass: passFixedDash },
  ];

  const results = [];
  for (const att of attempts) {
    try {
      const r = await fetch(`${BASE}/v2/stores/companies/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": att.ua },
        body: JSON.stringify({ username: att.user, password: att.pass }),
      });
      let txt = await r.text();
      let body = null; try { body = JSON.parse(txt); } catch (_) { body = txt; }
      results.push({ attempt: att.name, ua: att.ua, user: att.user, status: r.status, ok: r.ok, body });
    } catch (e) {
      results.push({ attempt: att.name, error: String(e) });
    }
  }

  return res.status(200).json({
    diagnostics: {
      ua: asciiReport("MODO_USER_AGENT", RAW_UA),
      user: asciiReport("MODO_USERNAME", RAW_USER),
      pass: asciiReport("MODO_PASSWORD", RAW_PASS),
      passFixedDashChanged: RAW_PASS !== passFixedDash
    },
    results
  });
}
