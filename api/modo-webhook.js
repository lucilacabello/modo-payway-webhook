// Vercel Serverless Function: MODO/Payway -> Shopify (con validación JWS/JWKS)
import * as jose from "node-jose";

// Importante: para comparar objetos de forma estable
function stableStringify(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

export const config = {
  api: {
    bodyParser: true, // JWS viene dentro del JSON (campo signature). Podemos parsear JSON normal.
  },
};

let modoKeyStore = null;

async function initModoKeyStore() {
  if (modoKeyStore) return modoKeyStore;
  const jwksUrl =
    process.env.MODO_JWKS_URL ||
    "https://merchants.preprod.playdigital.com.ar/v2/payment-requests/.well-known/jwks.json";
  const response = await fetch(jwksUrl);
  if (!response.ok) {
    const t = await response.text();
    throw new Error("No se pudo descargar JWKS de MODO: " + t);
  }
  const parsed = await response.json();
  modoKeyStore = await JWK.asKeyStore(parsed);
  return modoKeyStore;
}

async function verifyModoSignature(body) {
  // body.signature debe existir y ser un JWS en formato compact o JSON
  if (!body || !body.signature) return false;

  const keystore = await initModoKeyStore();

  // Verificar la firma y obtener el payload firmado
  const verification = await JWS.createVerify(keystore).verify(body.signature);
  const payloadFromSignature = JSON.parse(verification.payload.toString("utf8"));

  // Comparar payload del JWS con el body recibido SIN el campo signature
  const { signature, ...bodyWithoutSig } = body;

  // Igualamos tipos básicos por si amount llega string/number
  if (payloadFromSignature.amount && bodyWithoutSig.amount) {
    payloadFromSignature.amount = String(payloadFromSignature.amount);
    bodyWithoutSig.amount = String(bodyWithoutSig.amount);
  }

  return stableStringify(payloadFromSignature) === stableStringify(bodyWithoutSig);
}

// --- Shopify helpers ---
async function shopify(path, method = "GET", body) {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  const version = process.env.SHOPIFY_API_VERSION || "2024-04";
  if (!domain || !token) throw new Error("Faltan SHOPIFY_STORE_DOMAIN o SHOPIFY_ADMIN_TOKEN");
  const url = `https://${domain}/admin/api/${version}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify ${method} ${path} ${res.status}: ${text}`);
  }
  return res.json();
}

async function resolveOrderId(externalRef) {
  if (!externalRef) return null;
  // Si es numérico, intentamos directo
  if (/^\d+$/.test(String(externalRef))) {
    try {
      const data = await shopify(`/orders/${externalRef}.json`, "GET");
      return data?.order?.id || null;
    } catch { /* luego probamos por name */ }
  }
  const name = externalRef.startsWith("#") ? externalRef : `#${externalRef}`;
  const q = encodeURIComponent(name);
  const data = await shopify(`/orders.json?name=${q}&status=any&limit=1`, "GET");
  const order = (data.orders || [])[0];
  return order ? order.id : null;
}

// Idempotencia simple con memoria (en producción, usar Redis/DB)
globalThis.__processed ||= new Set();
const seen = globalThis.__processed;

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    const body = req.body || {};

    // 1) Validar firma JWS/JWKS
    const ok = await verifyModoSignature(body);
    if (!ok) return res.status(401).send("Firma inválida");

    // 2) Extraer campos (ajustar si tu payload difiere)
    const status = String(body.status || body.payment_status || "").toUpperCase();
    const amount = String(body.amount ?? body.total_amount ?? "");
    const currency = body.currency || "ARS";
    const paymentId = String(body.payment_id || body.id || body.txn_id || "");
    const externalRef = String(body.external_reference || body.order_id || body.reference || body.order_reference || "");
    const authorizationCode = String(body.authorization_code || body.auth_code || "");

    if (!paymentId || !externalRef) {
      // Respondemos 200 para no generar loops; loguear para análisis
      console.error("Webhook incompleto. paymentId/externalRef faltantes.", { paymentId, externalRef });
      return res.status(200).send("OK (faltan campos)");
    }

    // 3) Idempotencia
    const key = `modo:${paymentId}`;
    if (seen.has(key)) return res.status(200).send("OK (duplicado)");
    seen.add(key);

    // 4) Resolver pedido en Shopify
    const orderId = await resolveOrderId(externalRef);
    if (!orderId) {
      console.error("Pedido no encontrado por external_reference:", externalRef);
      return res.status(200).send("OK (pedido no encontrado)");
    }

    // 5) Mapear estados MODO → Shopify
    if (status === "ACCEPTED") {
      await shopify(`/orders/${orderId}/transactions.json`, "POST", {
        transaction: {
          kind: "sale",
          status: "success",
          gateway: "MODO (Payway)",
          amount,
          currency,
          authorization: authorizationCode || paymentId,
          test: false,
        },
      });
      return res.status(200).send("OK (aprobado)");
    }

    if (status === "REJECTED") {
      await shopify(`/orders/${orderId}/transactions.json`, "POST", {
        transaction: {
          kind: "sale",
          status: "failure",
          gateway: "MODO (Payway)",
          amount,
          currency,
          authorization: authorizationCode || paymentId,
          test: false,
        },
      });
      return res.status(200).send("OK (rechazado)");
    }

    // Estados intermedios: CREATED, SCANNED, PROCESSING
    return res.status(200).send("OK (estado intermedio)");
  } catch (err) {
    console.error("Error en webhook:", err);
    // Responder 200 para evitar tormenta de reintentos; ajustar a 500 si preferís que reintenten
    return res.status(200).send("OK (error manejado)");
  }
}
