# Deployment

## Local development

```bash
npm install
npm run dev
```

This starts the Vite client on <http://localhost:5005> and the Express/Socket.IO server on port `3001`. Vite proxies `/ws` and `/uploads` to port `3001`, so players and managers both use the Vite address on port `5005` during development. Only those paths are proxied; the backend health endpoints remain on port `3001`.

## Docker

```bash
docker compose up --build
```

The current Compose service is named `bazoot` and publishes <http://localhost:5005>. It serves the built client, HTTP endpoints, and Socket.IO from a single Node process.

> [!IMPORTANT]
> This command is a production-style local run, not a complete public-internet deployment. Before exposing Bazoot, configure HTTPS, a reverse proxy with WebSocket upgrade support, exact `CLIENT_URL` and `PUBLIC_URL` values, SMTP, backups, and access restrictions.

Set the public URLs in an environment override or deployment configuration:

```yaml
CLIENT_URL: https://quiz.example.com
PUBLIC_URL: https://quiz.example.com
```

`CLIENT_URL` is the exact browser origin allowed for CORS and Socket.IO handshakes. `PUBLIC_URL` is used in invitation, verification, and password-reset links. The Node server trusts one proxy hop; deploy it behind only a known proxy that sends the expected forwarded headers.

## Persistent data

`compose.yaml` defines the named `bazoot-data` Docker volume and mounts it at `/data`. It contains:

- `/data/bazoot.db`: SQLite data for accounts, hashed sessions, organizations, memberships, invitations, quizzes, and runtime settings.
- `/data/uploads`: manager-uploaded question media.
- `/data/accounts.json`, `/data/sessions.json`, and `/data/quizzes`: legacy import locations. Current data is stored in SQLite and uploads; these paths are retained for one-time legacy imports.

The `.env` file is not stored in this volume. Keep a secure, separate copy of production configuration and mail credentials. Do not use `docker compose down -v` unless you intend to remove the volume and permanently erase all persisted application data.

## Backup and restore

Back up the whole `/data` volume, not only the SQLite database: uploaded media is part of quiz content. Stop Bazoot or use a database-aware volume snapshot so the database and media are captured consistently. Do not schedule maintenance during a live game; live room state is not durable game history.

The following example is for Bash or WSL. It writes one compressed archive while the application is stopped:

```bash
docker compose stop
docker compose run -T --rm --no-deps --entrypoint tar bazoot -C /data -czf - . > bazoot-data-backup.tgz
docker compose start
```

To restore that archive, stop the service, replace the entire volume contents, restore the container user's ownership, then start and verify the application:

```bash
docker compose stop
docker compose run -T --rm --no-deps --user root --entrypoint sh bazoot -c 'rm -rf /data/* && tar -xzf - -C /data && chown -R node:node /data' < bazoot-data-backup.tgz
docker compose up -d
curl --fail http://localhost:5005/health
```

The restore command intentionally replaces `/data`; use a tested backup and keep a separate copy before restoring. On Windows without WSL, use the equivalent Docker Desktop or storage-volume backup workflow, preserving the same stop → replace all of `/data` → start → health-check sequence.

## Scaling

Run one container for small deployments by default. The app uses SQLite and an in-memory room store in that topology. For multiple Node instances, set `REDIS_URL` so Socket.IO and room state use Redis, provide shared durable database and media storage, and configure the reverse proxy/load balancer for WebSocket traffic. The bundled Compose file does not supply a complete multi-instance storage or high-availability setup.

## Upgrades

Back up `/data` before upgrading. For Docker:

```bash
git pull
docker compose up -d --build
```

For a Node.js deployment, install dependencies, rebuild the client, then restart the process manager that runs the server:

```bash
git pull
npm install
npm run build
```

The server initializes its SQLite schema at startup; no separate database-migration command is currently provided.
