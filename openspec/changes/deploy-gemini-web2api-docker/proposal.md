## Why

`gemini_web2api` needs to run as a durable, internet-facing service on this server (Ubuntu 24.04) reachable at `gemini-api.algieba12.cn` over HTTPS. Today there is no deployment: no container runtime, no reverse proxy, no TLS, no auth gateway, and no auto-update. We need a containerized, low-maintenance deployment that does not pollute the host environment, enforces external authentication, and keeps itself up to date.

## What Changes

- Containerize the service and reverse proxy with Docker Compose so the host only needs Docker installed (no host-level Python/Nginx).
- Run the application container with `network_mode: host`, binding the app to `127.0.0.1:8081` with `api_keys=[]` (internal callers unauthenticated). The README warns Docker bridge NAT can cause empty Gemini responses, so host networking is required.
- Run the application process as a **non-root** user inside the container.
- Add an Nginx container (`network_mode: host`) terminating HTTP/HTTPS on 80/443, redirecting 80→443, and enforcing an `Authorization: Bearer <key>` check — external requests without a valid key receive `401`.
- Generate a random external API key (`openssl rand`) used by the Nginx auth gate.
- Terminate TLS using a **Cloudflare Origin Certificate** (15-year validity) with Cloudflare SSL mode `Full (strict)`; the domain is proxied (orange-cloud) and the edge certificate is auto-renewed by Cloudflare.
- Add a git auto-update mechanism: a script that pulls latest code and rebuilds/restarts the Compose stack, driven by a host systemd timer.

## Capabilities

### New Capabilities
- `containerized-deployment`: Docker Compose stack (app + Nginx) running on host networking with a non-root app container, app bound to loopback.
- `tls-reverse-proxy`: Nginx reverse proxy terminating TLS via Cloudflare Origin Certificate and proxying to the local app.
- `external-api-auth`: Edge Bearer-token enforcement at Nginx — external requests require a valid random key, internal loopback callers are unauthenticated.
- `auto-update`: git pull + Compose rebuild/restart automation via host systemd timer.

### Modified Capabilities
<!-- None: no existing spec requirements change. -->

## Impact

- **Host**: installs Docker Engine + compose plugin and a systemd service/timer; no other host packages.
- **New files**: `config.json`, `docker-compose.prod.yml`, `nginx/gemini-api.conf`, `nginx/ssl/` (Origin cert + key), `scripts/auto-update.sh`, systemd unit + timer.
- **Modified files**: `Dockerfile` (add non-root user, mount config at runtime instead of COPY).
- **External**: Cloudflare dashboard config (Origin Certificate, SSL mode `Full (strict)`, Always Use HTTPS); A record already exists.
- **Network/ports**: host binds `0.0.0.0:80/443` (Nginx) and `127.0.0.1:8081` (app, not externally exposed).
- **Out of scope**: Gemini Pro model / cookie configuration.
