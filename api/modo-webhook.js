// /api/modo-webhook.js (bypass de firma para test)

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    const allowUnsigned = String(process.env.ALLOW_UNSIGNED_WEBHOOKS || '').toLowerCase() === 'true';

    // LOG para ver el body en Vercel Logs
    console.log('MODO WEBHOOK TEST:', JSON.stringify(req.body));

    // Si más adelante querés validar firma, hacelo acá
    if (!allowUnsigned) {
      // TODO: verify signature/JWKS...
      return res.status(400).json({ error: 'SIGNATURE_REQUIRED_FOR_TEST' });
    }

    // Simulá side-effect: si ACCEPTED -> OK
    if (String(req.body?.status).toUpperCase() === 'ACCEPTED') {
      return res.status(200).json({ ok: true, simulated: true });
    }

    return res.status(200).json({ ok: true, note: 'Non-ACCEPTED status' });
  } catch (e) {
    console.error('WEBHOOK_TEST_ERROR:', e);
    return res.status(500).json({ error: 'SERVER_ERROR', message: e?.message || String(e) });
  }
}

