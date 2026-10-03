# Security and demo boundaries

This repository is a reference demo, not a production payment backend.

The static frontend is uploaded to Swipe. The API-only Worker is deployed independently. Production order endpoints return HTTP 501 until merchant authentication, user ownership, real payment registration, and signed receipt verification are implemented. Mock payments require an explicit build option and mock order APIs only run on localhost. Never submit real customer data to the demo.

The “Login with Swipe” button requests consent to prefill profile fields. It does not create a merchant-authenticated session. “Logout” clears this mini app's local state; it does not log the user out of the Swipe host. A random demo session header scopes local demo history, but it is not production authentication.

Server prices come from the catalogue. Bodies are limited to 16 KiB as they are read, validated by Zod, and quantities must be integer numbers. Receipts have a unique database index. Repeating fulfilment with the same receipt returns the completed order; reusing a receipt on another order is rejected. Mock proof prefixes are only syntactic validation, never cryptographic payment verification.

Before accepting real payments, implement server-side merchant payment registration, signature verification with trusted JWKS, issuer/audience/expiry and merchant/payee/amount/currency/reference checks, durable replay prevention, authenticated order ownership, edge rate limits, verified webhooks, and a customer-data retention policy. CORS is a browser access policy, not authentication.

Report security issues privately to the repository maintainer. Do not include tokens, customer data, or working exploit details in public issues. Configure GitHub private vulnerability reporting when publishing.
