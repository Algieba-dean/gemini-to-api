# Deployment (Docker + Nginx reverse proxy)

Run `gemini-web2api` behind an Nginx reverse proxy that terminates TLS and
enforces a Bearer-token API key. Everything is configured through a `.env` file
(no values are hardcoded), so this works for any domain / certificate.

## Architecture

- **App container** (`gemini-web2api`): host networking, binds `${APP_HOST}:${APP_PORT}` (default `127.0.0.1:8081`), `api_keys=[]` so internal/loopback callers need no key. Runs as non-root `appuser`.
- **Nginx container** (`gemini-nginx`): host networking, terminates TLS on 80/443, requires `Authorization: Bearer ${API_KEY}` for external requests (else `401`), proxies to the app.
- **TLS**: any certificate works. Cloudflare Origin Certificate (proxied/orange-cloud) or Let's Encrypt are both fine. Point `CERT_DIR` / `SSL_CERT_FILE` / `SSL_CERT_KEY_FILE` at your files.

## Files

- `.env.example` — configuration template. Copy to `.env` and fill in (`.env` is gitignored).
- `docker-compose.prod.yml` — the two-service stack.
- `config.example.json` → copy to `config.json` (gitignored). Set `host`/`port` to match `APP_HOST`/`APP_PORT`, keep `api_keys` empty (auth is at Nginx).
- `nginx/templates/default.conf.template` — parameterized reverse proxy + TLS + auth gate (rendered at container start).
- `scripts/auto-update.sh` — git pull + rebuild.
- `scripts/install-systemd.sh` — installs a systemd timer for scheduled updates (paths auto-derived).

## First-time setup

```bash
# 1. Install Docker Engine + compose plugin (host)
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# 2. Configure
cp .env.example .env
cp config.example.json config.json
#   - edit .env: SERVER_NAME, CERT_DIR, SSL_CERT_FILE, SSL_CERT_KEY_FILE, API_KEY
#   - generate a key:  openssl rand -hex 24
#   - edit config.json: set "host"/"port" to APP_HOST/APP_PORT, "api_keys": []

# 3. Ensure your cert + key exist inside CERT_DIR
ls "$CERT_DIR"   # should contain $SSL_CERT_FILE and $SSL_CERT_KEY_FILE

# 4. Build & start
docker compose -f docker-compose.prod.yml up -d --build

# 5. Install the auto-update timer (optional; default every 30min)
sudo bash scripts/install-systemd.sh 30min
```

If you use Cloudflare (proxied), set SSL/TLS mode to **Full (strict)** and enable **Always Use HTTPS** in the dashboard.

## The external API key

The key lives only in `.env` as `API_KEY` (gitignored). To rotate it, edit `.env`
and recreate Nginx so the template re-renders:

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
```

## Verify

```bash
# internal (no key)
curl http://${APP_HOST}:${APP_PORT}/

# external with key -> 200
curl https://${SERVER_NAME}/v1/models -H "Authorization: Bearer ${API_KEY}"

# external without key -> 401
curl -i https://${SERVER_NAME}/v1/models
```

## Operations

```bash
docker compose -f docker-compose.prod.yml ps          # status
docker compose -f docker-compose.prod.yml logs -f     # logs
docker compose -f docker-compose.prod.yml up -d --build   # apply code changes
systemctl list-timers gemini-update.timer             # update schedule
```
