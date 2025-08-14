# Webhook MODO/Payway → Shopify (Vercel, con JWS/JWKS)

Listo para **preproducción** de MODO (firma JWS, JWKS oficial). Marca pedidos de Shopify como **Pagados** cuando MODO envía `ACCEPTED`.

## Variables de entorno (Vercel → Project Settings → Environment Variables)
- `SHOPIFY_STORE_DOMAIN` → `midominio.myshopify.com`
- `SHOPIFY_ADMIN_TOKEN` → token Admin API (app personalizada con scopes `read_orders`, `write_orders`)
- `SHOPIFY_API_VERSION` → `2024-04` (o vigente)
- `MODO_JWKS_URL` → `https://merchants.preprod.playdigital.com.ar/v2/payment-requests/.well-known/jwks.json`

## Deploy
1. Subí este proyecto a Vercel (nuevo proyecto).  
2. Cargá las variables de entorno anteriores.  
3. Deploy. Tu Webhook URL será:  
   `https://TU-PROYECTO.vercel.app/api/modo-webhook`

## Shopify (una vez)
- Crear **App personalizada** (Admin → Apps → Desarrollar apps → Crear) con scopes `read_orders`, `write_orders`. Copiar token.  
- Crear **método de pago manual** “MODO (Payway)” para que el pedido quede **Pendiente** hasta que llegue el webhook.

## MODO
- Registrar como **Webhook URL**: `https://TU-PROYECTO.vercel.app/api/modo-webhook`  
- En el inicio de pago, enviar `external_reference` con el **order_id** (o `order_name`) de Shopify.

## Estados
- `ACCEPTED` → crea transacción `sale/success` (pedido Pagado)  
- `REJECTED` → crea transacción `sale/failure`  
- `CREATED`, `SCANNED`, `PROCESSING` → responde 200 y no cambia el pedido.

## Prueba (sin firma real)
Podés postear un JSON de prueba (mismo formato que MODO) directamente al endpoint para verificar flujos internos.  
En producción, la **firma JWS** es obligatoria: el handler la valida contra el **JWKS** de preprod.

## Escala
- Vercel Serverless (autoescala, HTTPS, baja latencia).
- Idempotencia básica (memoria). Para alto volumen, agregar Redis/DB.
- Responde 200 rápido para evitar tormenta de reintentos.
