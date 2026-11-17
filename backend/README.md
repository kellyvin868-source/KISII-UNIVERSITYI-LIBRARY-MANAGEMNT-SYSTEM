# Kisii University Library Management System

Backend API for the Kisii University Library Management System. The API contract is maintained in [`openapi.yaml`](./openapi.yaml). The React application is in `../frontend`.

## Requirements and local setup

- Node.js 20 or newer
- MongoDB 6 or newer (local or hosted)
- npm

From `backend/`:

```bash
npm install
cp .env.example .env
# Set MONGO_URI and a private JWT_SECRET_KEY in .env
npm run dev
```

The API listens on `http://localhost:4000` by default. From another terminal:

```bash
cd ../frontend
npm install
npm run dev
```

The frontend defaults to `http://localhost:4000/v1`. Set `VITE_API_BASE_URL` at build time to use another API base URL. Credentialed browser requests require the exact frontend origin in `CORS_ORIGIN`.

The interactive API reference is available at `http://localhost:4000/docs`, the raw OpenAPI document at `/openapi.yaml`, and the database readiness probe at `/health/ready`.

Never commit `.env` or use real secrets in documentation. `.env.example` contains placeholders only.

## API overview

All paths below are prefixed with `/v1`. Most member and staff endpoints require the HTTP-only JWT cookie set by registration/login; protected APIs also accept `Authorization: Bearer <JWT>`. Catalog reads and ISBN lookup are public. Catalog writes require `LIBRARIAN` or `ADMIN`. Member data is scoped to the signed-in member unless staff access is documented.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Process health check |
| `POST` | `/auth/register` | Register a member and set session cookie |
| `POST` | `/auth/login` | Authenticate and set session cookie |
| `POST` | `/auth/logout` | Revoke the current session |
| `GET` | `/auth/me` | Get current member profile and enrollment status |
| `GET` | `/books` | Search/filter/paginate active titles |
| `GET` | `/books/{id}` | Get title details |
| `POST` | `/books` | Add a title (staff); optional `copyBarcodes` creates barcode records |
| `PUT` | `/books/{id}` | Update a title (staff) |
| `DELETE` | `/books/{id}` | Soft-archive a title (staff) |
| `GET` | `/books/{id}/copies` | List physical copies and statuses |
| `POST` | `/books/{id}/copies` | Add a physical copy (staff) |
| `PATCH` | `/books/copies/{copyId}` | Update copy condition/status (staff) |
| `GET`, `POST` | `/authors`, `/categories` | List public lookup values; create requires staff |
| `GET`, `POST` | `/members` | List members (staff); register a member |
| `GET`, `PUT` | `/members/{id}` | View/update self or staff-authorized profile |
| `PATCH` | `/members/{id}/deactivate` | Deactivate self or another account as admin |
| `GET` | `/members/{id}/loans` | View authorized borrowing history |
| `GET`, `POST` | `/loans` | List accessible loans; check out an available title |
| `POST` | `/loans/{id}/return` | Return an active loan |
| `POST` | `/loans/{id}/renew` | Renew an eligible loan once |
| `GET`, `POST` | `/reservations` | List accessible reservations; reserve an unavailable title |
| `POST` | `/reservations/{id}/cancel` | Cancel a waiting/ready reservation |
| `GET`, `POST` | `/fines` | List fines; staff can calculate overdue fine from a loan |
| `GET` | `/payments` | View accessible payment history |
| `POST` | `/payments/mpesa/initiate` | Initiate an M-Pesa fine payment |
| `POST` | `/payments/mpesa/callback?token=...` | Receive provider callback |
| `GET` | `/external/students/{regNo}/verify` | Verify enrollment through configured registry |
| `GET` | `/external/isbn/{isbn}` | Look up book metadata via Google Books |
| `GET` | `/ai/search?q=...` | Nemotron-assisted catalog search backed by MongoDB |
| `POST` | `/ai/chat` | Stateless general library assistant |
| `GET` | `/ai/recommendations/{memberId}` | Personalized catalog recommendations |
| `GET` | `/ai/forecast/demand` | Historical borrowing frequency (staff) |
| `POST` | `/ai/categorize` | Suggest catalog categories (staff) |
| `GET` | `/notifications` | View recent notification queue records (staff) |
| `POST` | `/notifications/email` | Queue an email (staff) |
| `POST` | `/notifications/sms` | Queue an SMS (staff) |

Catalog query parameters include `query`, `categoryId`, `authorId`, `isbn`, `available=true|false`, `sort` (`title`, `title_desc`, or `created_asc`), `page`, and `limit` (maximum 100). Responses use JSON. Error responses include `success: false` and a user-safe `message`.

### Member onboarding and staff provisioning

Public registration always assigns the `MEMBER` role. Supply `regNo` to link a student account to the institutional registry. Student borrowing is disabled until `/external/students/{regNo}/verify` confirms active enrollment. The integration requires the institution's real endpoint and credentials; the expected registry response is `{ "verified": true|false }`.

There is deliberately no public staff-role escalation or default administrator password. Provision the first trusted administrator through a protected operational process (for example, a one-time database bootstrap performed by an authorized operator); then use the admin-only member update API to assign staff roles. Do not expose a bootstrap endpoint in a public deployment.

### Circulation and inventory

Titles can retain aggregate inventory for compatibility with older records. Staff may create copies with optional `copyBarcodes` or add copies individually with an optional barcode; supplied barcodes must be unique. Managed copies have `AVAILABLE`, `HELD`, `ON_LOAN`, `DAMAGED`, `LOST`, or `WITHDRAWN` states. Checkout selects an available physical copy when one is managed. Return releases the copy and advances the next reservation. Reservations hold copies for two days; loans are 14 days, allow one renewal, and are limited to five active loans per member. Overdue fines default to KSh 10 per day and can be changed with `OVERDUE_FINE_PER_DAY`.

If upgrading a database created before optional copy barcodes, drop its old unique `barcode_1` index once before starting the updated server so Mongoose can create the new partial unique index: `db.bookcopies.dropIndex("barcode_1")`.

The circulation flows use guarded MongoDB updates and compensating operations, not multi-document transactions. Use a MongoDB replica set and add transaction-based workflows before relying on this API for high-concurrency financial/inventory operations.

## AI behavior

Smart search asks NVIDIA Nemotron (`nvidia/nemotron-3.5-lightning:free`) through OpenRouter to extract search phrases, then returns real matching catalog records from MongoDB. AI does not invent search results. The chat assistant is single-turn and stateless; it has no access to live inventory, account, loan, fine, or policy records. Do not send sensitive personal, authentication, or payment data to the external provider. Free model availability and quotas are controlled by OpenRouter and may change.

Set `OPENROUTER_API_KEY` to enable AI. Missing configuration and upstream provider failures are returned as explicit API errors.

## Integrations and background processing

Provider integrations are disabled until configured:

- M-Pesa Daraja STK Push uses sandbox by default. Callback URL must be publicly reachable and include the shared callback token query parameter.
- Student registry verification assumes the configured endpoint returns `{ "verified": boolean }`; confirm the real institution contract before enabling it.
- SMTP email and Africa's Talking SMS are optional. Notifications are persisted and retried by a background worker; delivery depends on valid provider accounts.
- For Gmail SMTP, use `smtp.gmail.com` on port `587` with `SMTP_SECURE=false`. Turn on 2-Step Verification in the Google Account, generate an App Password, and set it as `SMTP_PASSWORD` without spaces; use the Gmail address for both `SMTP_USER` and `SMTP_FROM`. Keep these values in `.env`, never commit or share the App Password.
- ISBN lookup uses the public Google Books API.

The server runs periodic notification delivery, overdue-fine updates, and reservation-hold expiry while it is running. `GET /` reports process status only; it is not a database readiness probe.

## Environment variables

See [`.env.example`](./.env.example) for the complete placeholder template. Required for core API operation: `MONGO_URI` and `JWT_SECRET_KEY`. Other provider credentials are only required for their corresponding integrations. Set `NODE_ENV=production`, HTTPS, a restrictive `CORS_ORIGIN`, and unique high-entropy secrets in deployments.

## Tests and checks

From `backend/`:

```bash
npm test
npm run openapi:validate
npm run mock
```

The Prism mock server listens on port 4010 and serves contract paths without the backend's `/v1` prefix. `npm run seed` inserts idempotent demo catalog data; `npm run migrate` creates declared indexes and updates the legacy copy-barcode index. Never run these maintenance commands against production without an approved backup and maintenance window.

From `frontend/`:

```bash
npm run lint
npm run build
```

The automated API tests use mocks and do not require live MongoDB, OpenRouter, M-Pesa, SMTP, SMS, or registry credentials. Validate those integrations in their provider sandboxes before production use.

## Deployment status and limitations

This repository contains application code and setup guidance, not a live university deployment. Production hosting, DNS/TLS, provider accounts, real registry API details, backups, restore drills, and production monitoring require authorized infrastructure and credentials. Configure database backups and test restore procedures before production use. The API does not include a dedicated readiness endpoint, rate limiting, a password-reset flow, or managed administrator bootstrap; those are operational/production hardening items.

The OpenAPI server list intentionally documents local development only. Add an actual deployment URL after it has been provisioned and verified.
