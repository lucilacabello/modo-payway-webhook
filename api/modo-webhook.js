// --- dentro de tu handler, apenas parseás el body del webhook ---
const rawStatus = String(body.status || "").toUpperCase();

// Normalización minimalista por si alguna integración envía "APPROVED"
const status = rawStatus === "APPROVED" ? "ACCEPTED" : rawStatus;

// ✅ PRIORIDAD a external_intention_id (by the book)
//   fallback: external_reference, order_id, reference, order_reference
const externalRef = String(
  body.external_intention_id
  || body.external_reference
  || body.order_id
  || body.reference
  || body.order_reference
  || ""
).trim();

if (!externalRef) {
  console.warn("Webhook sin external reference/intention id", body);
  return res.status(400).json({ ok: false, error: "missing_external_reference" });
}

// (Si tu función resolvía la orden acá, dejala igual pero usando externalRef)
const { orderId, orderName } = await resolveOrderFromExternalRef(externalRef);
// ... el resto de tu lógica sigue igual ...

// Ejemplo de switch sin tocar tu lógica:
switch (status) {
  case "ACCEPTED":
    // marcar pagada / crear transaction success
    await markOrderPaidInShopify({ orderId, body });
    break;

  case "REJECTED":
    // etiquetar/tomar acción de rechazo
    await markOrderRejectedInShopify({ orderId, body });
    break;

  case "SCANNED":
  case "PROCESSING":
  default:
    // solo log o note, sin efectos contables
    await addOrderNoteInShopify({
      orderId,
      note: `MODO: ${status} - ${body.payment_id || ""}`.trim()
    });
    break;
}

return res.status(200).json({ ok: true });

