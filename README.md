# Kisii University Library Management System

Full-stack library catalog and circulation project for the COMP 330 project workbook. The OpenAPI document is the API contract; the backend, mock server, frontend, and interactive API docs are built from the same project.

## Run locally

Requirements: Node.js 22+, npm, Docker with the Compose plugin, and a MongoDB connection for running the backend without containers.

### Docker Compose

```sh
test -f backend/.env || cp backend/.env.example backend/.env
# Set MONGO_URI and JWT_SECRET_KEY in backend/.env for local development.
docker compose up --build
```

Open the frontend at <http://localhost:8080>, interactive API docs at <http://localhost:4000/docs>, and the API health check at <http://localhost:4000/health/ready>. The Compose MongoDB volume persists data between restarts.

Seed example catalog data and apply indexes/migrations:

```sh
docker compose exec api npm run migrate
docker compose exec api npm run seed
```

The seed operation is idempotent and only adds catalog examples; it does not create an administrator or a reusable user password.

Back up the Compose database and restore to a separate database for verification:

```sh
sh scripts/backup.sh
sh scripts/restore-to-new-db.sh backups/kisii-library-YYYYMMDDTHHMMSSZ.archive
```

The restore script never drops or overwrites the active database. Verify recovered records before directing an API instance to the restored database.

### Run services without Docker

In `backend/`, install dependencies, copy `.env.example` to `.env`, configure MongoDB and a private `JWT_SECRET_KEY`, then run:

```sh
npm ci
npm run migrate
npm run seed
npm run dev
```

In `frontend/`, run `npm ci` and `npm run dev`. The frontend defaults to `http://localhost:4000/v1`; set `VITE_API_BASE_URL` when the API uses another address.

## Project deliverables

- **API contract and docs:** [backend/openapi.yaml](./backend/openapi.yaml), validated with `cd backend && npm run openapi:validate`; interactive Swagger UI is served at `/docs`.
- **Mock server:** run `cd backend && npm ci && npm run mock`; Prism serves the OpenAPI contract at `http://localhost:4010`. For the mock, set the frontend `VITE_API_BASE_URL=http://localhost:4010` (Prism serves paths without the real API's `/v1` prefix).
- **Backend:** Express API for catalog, accounts, circulation, reservations, fines/payments, notifications, integrations, and AI.
- **Frontend:** React application for public catalog, member account, AI assistant, and staff management.
- **Database:** Mongoose schemas and indexes, explicit migration command, idempotent catalog seed.
- **Deployment and recovery:** Dockerfiles, `compose.yaml`, and backup/restore scripts provide a portable container deployment and safe recovery workflow. A public deployment still needs an authorized host and external MongoDB credentials.
- **AI and external services:** OpenRouter AI plus optional registry, ISBN, M-Pesa, Gmail SMTP, and SMS providers. These require the corresponding credentials and provider configuration.
- **CI:** GitHub Actions runs backend tests, OpenAPI validation, frontend lint, and frontend production build.

## Verification

```sh
cd backend && npm test && npm run openapi:validate
cd ../frontend && npm run lint && npm run build
```

Some workbook rules—weekly progress reports, team meetings, milestone assessments, and the final presentation—are team/academic activities rather than application behavior and must be completed by the project team.

Never commit `.env` files or share provider credentials. See [backend/README.md](./backend/README.md) for API details and integration configuration.
