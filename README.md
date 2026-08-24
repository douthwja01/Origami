# Origami

Self-hosted nested project vault. Each project has an ID, title, start date, and status. Projects nest. Files are imported into a vault and grouped as media, code, documents, or CAD.

## Quick start (Docker)

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000) and sign in with:

- username: `admin`
- password: `origami`

Change these before exposing the app on a network. See **Production** below.

## Local development

You need Node.js 22+ and Postgres. The compose file can run only the database:

```bash
docker compose up db -d
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

`.env.example` defaults:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `ORIGAMI_SESSION_SECRET` | Cookie signing key, **at least 32 characters** |
| `ORIGAMI_USER` | Login username |
| `ORIGAMI_PASSWORD` | Login password (dev / first run) |
| `ORIGAMI_PASSWORD_HASH` | bcrypt hash; preferred in production |
| `ORIGAMI_VAULT_DIR` | Where uploaded files are stored (inside the process / container) |
| `ORIGAMI_VAULT_HOST` | Host folder bind-mounted as the vault when using Docker Compose (default `./data/vault`) |
| `ORIGAMI_MAX_UPLOAD_MB` | Upload cap (default 512) |

Hash a production password:

```bash
npm run hash-password -- 'your-strong-password'
```

Set `ORIGAMI_PASSWORD_HASH` to the printed value and unset `ORIGAMI_PASSWORD`.

## Production (VPS)

1. Copy the repo to the server.
2. Set a long `ORIGAMI_SESSION_SECRET` and `ORIGAMI_PASSWORD_HASH` in `docker-compose.yml` or an env file. Do not keep the default password.
3. Put Caddy or Traefik in front of port 3000 for HTTPS. Example Caddy:

```
origami.example.com {
  reverse_proxy localhost:3000
  request_body {
    max_size 512MB
  }
}
```

4. Run `docker compose up -d --build`.

Postgres data lives in the `pgdata` Docker volume. Vault files are bind-mounted from `./data/vault` on the host (override with `ORIGAMI_VAULT_HOST` in `.env`). Back both up.

## Projects

- Top-level IDs are assigned as `PROJ-001`, `PROJ-002`, … Nested projects use dotted IDs (`001.1`, `001.1.1`, …). IDs can be edited.
- Statuses: Planned, Active, On hold, Done, Archived.
- A project can nest under another. Moving a project under itself or a descendant is blocked.
- Deleting a project that has children or files requires **Delete with nested + files**.

## Vault

Files are copied into the vault, not linked in place. Kind is inferred from the file extension and can be overridden by uploading on a specific tab.

- **Media** — images, audio, video (inline preview)
- **Code** — source and archives (syntax highlighting)
- **Documents** — PDF, Office, markdown, text
- **CAD** — STEP, IGES, STL, OBJ, DXF, DWG, and similar. STL/OBJ preview in the browser; other CAD formats download
