## Context

`gemini_web2api` is a single-purpose proxy that exposes Google Gemini's web interface as an OpenAI-compatible API. We are deploying it to a server (Ubuntu 24.04, public IP `103.7.136.235`) and exposing it at `gemini-api.algieba12.cn`, whose A record is already pointed at Cloudflare with the orange-cloud proxy enabled (DNS resolves to Cloudflare IPs).

Current state:
- Docker is **not** installed; Nginx/certbot are not installed.
- The repo provides a `Dockerfile` (`python:3.12-slim`, entrypoint `python -m gemini_web2api`) and a `docker-compose.local.yml` using bridge networking + port mapping.
- No `config.json` exists yet (only `config.example.json`).
- The README explicitly warns that Docker's default bridge NAT can cause Gemini to return empty responses, recommending host networking.

Constraints (from the user):
- "Use Docker wherever possible; do not pollute the host environment." → host installs only Docker.
- TLS via Cloudflare Origin Certificate (chosen Plan A).
- External API key randomly generated; external unauthenticated requests rejected; internal callers may be unauthenticated.
- Auto-update for both TLS (renewal) and code (git pull + restart).
- Run business processes as non-root inside containers (standard Docker daemon is acceptable).
- Gemini Pro / cookie configuration is out of scope.

## Goals / Non-Goals

**Goals:**
- A reproducible Docker Compose deployment (app + Nginx) where the host only needs Docker.
- HTTPS at `gemini-api.algieba12.cn` via Cloudflare Origin Certificate, `Full (strict)` mode.
- Edge-enforced Bearer-token auth: external requests need a valid random key; internal loopback callers do not.
- App reliably reaches Gemini upstream (host networking to avoid bridge NAT issues).
- App process runs as non-root in its container.
- Automatic git pull + Compose rebuild via a host systemd timer.

**Non-Goals:**
- Gemini Pro routing / cookie / `auth_user` / `xsrf_token` configuration.
- Let's Encrypt / certbot (not needed with Origin Certificate).
- Multi-host / HA / load balancing.
- Capturing real client IPs (optional `set_real_ip_from` left as a note).

## Decisions

**1. Host networking for the application container.**
The README documents empty Gemini responses behind Docker bridge NAT. Using `network_mode: host` and binding the app to `127.0.0.1:8081` avoids that while keeping the app off the public interface. Alternative (bridge + published port) was rejected due to the documented upstream issue.

**2. Nginx in a container, also host networking.**
Because the app binds the host loopback `127.0.0.1:8081`, the proxy must share that loopback. Running Nginx with `network_mode: host` lets it bind `0.0.0.0:80/443` and `proxy_pass http://127.0.0.1:8081`. Alternative (bridge + `host-gateway`) would require the app to listen on a routable address, weakening the loopback-only guarantee.

**3. Edge auth at Nginx via `map`, app `api_keys=[]`.**
Cleanly separates "internal = no auth" from "external = must auth". Nginx uses `map $http_authorization $ok { default 0; "Bearer <KEY>" 1; }` and returns `401` when `$ok = 0`. The app itself stays auth-free so local/internal callers on loopback work without a key. Alternative (app-level `api_keys`) was rejected because it cannot distinguish internal vs external callers.

**4. Cloudflare Origin Certificate (Plan A) over Let's Encrypt.**
With orange-cloud, Cloudflare auto-manages the edge certificate; the origin only needs a long-lived cert. Origin Certificate is valid 15 years → effectively zero renewal maintenance and no port-80 ACME dependency. Let's Encrypt + DNS-01 (Plan B) would add a Cloudflare API token and certbot; rejected for higher maintenance with no benefit here.

**5. Non-root app container; standard Docker daemon.**
Add an `appuser` (UID 1000) and `USER appuser` in the Dockerfile; the app binds high port 8081 so no special capabilities are needed. The Nginx official image keeps its master as root to bind 80/443 and drops workers to the `nginx` user (standard). Rootless Docker/Podman were considered but rejected for added complexity; the user selected standard Docker + non-root container.

**6. Mount `config.json` at runtime instead of COPY.**
Keeps secrets/config out of the image and lets us change config without rebuilding. The current Dockerfile COPYs `config.example.json`; we change it to expect a mounted `config.json`.

**7. Auto-update via systemd timer on host.**
A shell script (`scripts/auto-update.sh`) does `git fetch`, compares, `git pull`, then `docker compose -f docker-compose.prod.yml up -d --build`, logging output. A oneshot `gemini-update.service` + `gemini-update.timer` runs it on a schedule. This is the only host-level systemd footprint and installs no runtime dependencies. Cron was an alternative; systemd timer chosen for logging/journal integration and boot persistence.

## Risks / Trade-offs

- **Host networking exposes loopback binding correctness** → App must bind `127.0.0.1` (not `0.0.0.0`); verify with `ss`/curl that `8081` is not reachable from the public IP.
- **Nginx master runs as root to bind 80/443** → Accepted; workers drop privileges. Business code (app) is non-root, satisfying the requirement.
- **Origin Certificate private key on disk** → Store under `nginx/ssl/` with `chmod 600`, gitignored; never commit.
- **Random key leakage via git** → Key lives only in Nginx config/secret, added to `.gitignore`; not committed.
- **Auto-update could pull a broken commit and restart** → Mitigate by building before swapping (`up -d --build`) and logging; rollback = `git checkout <prev>` + rebuild. Frequent schedule keeps diffs small.
- **Cloudflare sees only CF IPs at origin** → Real client IP not logged unless `set_real_ip_from` + CF ranges configured (optional, out of scope).
- **Upstream rate limiting / empty responses persist** → If they recur, confirm host networking is actually active and the host can reach `gemini.google.com` directly.

## Migration Plan

1. Install Docker Engine + compose plugin; enable the daemon.
2. Create `config.json` (`host=127.0.0.1`, `port=8081`, `api_keys=[]`).
3. Update `Dockerfile` (non-root user, runtime-mounted config).
4. Add `docker-compose.prod.yml` (app + nginx, host networking).
5. Generate random key; add `nginx/gemini-api.conf` with auth `map` + TLS.
6. Install Cloudflare Origin Certificate under `nginx/ssl/`; set CF SSL mode `Full (strict)`.
7. `docker compose -f docker-compose.prod.yml up -d --build`; verify loopback, public-with-key (200), public-without-key (401), and streaming.
8. Add `scripts/auto-update.sh` + systemd service/timer; enable and dry-run once.

Rollback: `docker compose -f docker-compose.prod.yml down` stops the stack; revert repo to previous commit and rebuild. No host packages beyond Docker to uninstall.

## Open Questions

- Operator must generate/provide the Cloudflare Origin Certificate (cert + key) before step 6.
- Update timer cadence (default proposed: every 30 minutes) — confirm preferred interval.
- Which git branch the auto-update tracks (assumed default branch / current checkout).
