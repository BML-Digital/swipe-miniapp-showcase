# Swipe Mini App Showcase

**Swipe MiniApp Demo** is a mobile-first bundled reference app for merchant merchandise: a heavyweight T-shirt, violet cap, and studio mug using Swipe’s current electric-violet, lavender, black, peach, and yellow brand language.

The frontend is a verified uploadable bundle built with React, Tailwind CSS, selected shadcn/Radix primitives, TanStack Query, Zod, and self-hosted Inter. A separate Cloudflare Worker provides the product and order APIs, D1 persistence, and guarded verification boundaries.

The sample includes a multi-item cart, quantity and size controls, delivery checkout, consent-based “Authorize with Swipe” profile prefill, payment handoff, animated confirmation, and My Orders history.

## Architecture

```text
src/                  React source and small shadcn-style component layer
public/               Local branded images and CSP-safe Lottie runtime
miniapp/              Generated static upload bundle
worker/src/index.ts   API-only Cloudflare Worker
schema.sql            D1 orders and local demo-session ownership
wrangler.jsonc        API Worker and D1 configuration
```

The two deployment units are intentionally separate. Swipe’s mini-app runtime serves only the static ZIP produced from `miniapp/`; it performs no SSR and runs no Worker code from this repository. Cloudflare deploys `worker/src/index.ts` separately as an API-only Worker with D1. The Worker returns 404 for non-API routes and has no static-assets binding.

## Local development

```sh
make setup
make run
```

`make run` starts two local processes: Vite serves the static frontend at `http://localhost:8787`, and Wrangler serves only the API at `http://localhost:8788`. Vite proxies `/api/*` to Wrangler. Open `http://localhost:8787/?mock=1` to enable the development-only wallet bridge.

For an uploaded production bundle, compile the deployed Worker origin into the static frontend:

```sh
VITE_API_BASE_URL=https://your-worker.example.com npm run bundle:release
```

Upload only `dist/swipe-miniapp-demo.zip` to Swipe. Add the exact Worker HTTPS origin to the mini-app manifest’s `network_allow` list and `connect-src`; do not use a wildcard. The runtime supplies the deployment CSP while serving the immutable static files. The real Swipe host disables WebView DOM storage, so the cart falls back to in-memory state and never depends on cookies or `localStorage`.

Set the same exact bundle origin as the Worker’s `ALLOWED_ORIGIN` secret/variable. Its CORS preflight rejects every other origin and never emits wildcard credentials access.

## Commands

```sh
make setup    # Install Worker tooling and initialize local D1
make run      # Start static Vite frontend (:8787) and API Worker (:8788)
make test     # API regression tests, type-check and production-build
make bundle   # Create the uploaded mini-app ZIP
make verify   # Type-check and validate the generated ZIP
make clean    # Remove dist
npm run deploy:api # Deploy only the API Worker to Cloudflare
```

## API

```text
GET  /api/health
GET  /api/products
GET  /api/orders
POST /api/orders
POST /api/orders/:orderId/fulfill
POST /api/profile/session
POST /api/webhooks/swipe
```

Prices are stored as integer laari. The server ignores client totals, resolves every product against its own catalogue, validates quantities and variants, and generates one idempotency key per order.

## Production safety

**This is a local reference demo. Real payments are not implemented.** Order APIs are localhost-only and return 501 on deployed Workers. See [SECURITY.md](SECURITY.md) for the integration work required before accepting payments.

Run `npm test` for the API regression suite. A production build ignores `?mock=1` unless explicitly built with `VITE_ENABLE_DEMO=true`; never enable that for a real merchant app. Demo order history belongs to the current tab session and clears on Logout. The Swipe WebView may not persist that session across launches.

Do not publish generated build directories or local customer databases. The repository does not yet have a selected license; confirm branding/asset permissions and select one before publication.

## Production safety details

Demo receipt values are accepted only when `DEMO_MODE=true` and must use the unmistakable `rcpt_mock_…` and `mock.receipt.…` prefixes. Production order, profile-token, receipt, and webhook verification boundaries fail closed with HTTP 501 until connected to the platform-maintained verifier. Fulfilment is an atomic, one-way database transition, so a completed order cannot be fulfilled twice.

Before deployment, add:

- Merchant API OAuth and payment registration.
- Swipe JWKS signature verification.
- Exact `iss`, `aud`, `kind`, expiry, amount, currency, merchant, payee, reference, receipt, and idempotency claim checks.
- Atomic `jti` replay prevention.
- Verified webhook signatures.
- Authenticated, user-scoped order queries and rate limiting at the Worker edge.
- Real Cloudflare D1 database ID and Worker secrets.

No session, Merchant API credential, or production mock belongs in `miniapp/`.

### Verified against the Swipe host

The integration matches the bridge implemented in `swipe-app`: `wallet.profile.get({ fields })`, `wallet.payment.charge(...)`, and `wallet.payment.status({ receiptId })`. “Authorize with Swipe” means profile consent, not another login—the user is already authenticated by the host. Swipe owns the payment confirmation UI, wallet identity, permission enforcement, origin guard, and session credentials.

## Bundle

```sh
make bundle
```

Output: `dist/swipe-miniapp-demo.zip`. The script prints the platform-compatible `sha384-…` digest. The package contains compiled relative assets, self-hosted Inter, the CSP-safe Lottie light runtime, and optimized WebP product photography—never the Worker, D1 schema, source maps, or secrets.

## Branding and generated images

The visual direction follows the current public [Swipe website](https://swipe.mv/): electric violet and pale lavender as primary colors, black product contrast, and warm peach/yellow accents. Product photographs were generated specifically for this sample and optimized to 1024px WebP files for mobile delivery.
