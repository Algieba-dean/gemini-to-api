## 1. Install Docker on host

- [x] 1.1 Install Docker Engine + `docker-compose-plugin` via the official install script
- [x] 1.2 `systemctl enable --now docker`
- [x] 1.3 Verify Docker daemon active and `docker compose version` (v5.2.0)

## 2. Application config & non-root image

- [x] 2.1 Create `config.json` from `config.example.json` with `host=127.0.0.1`, `port=8081`, `api_keys=[]`, `log_requests=true`
- [x] 2.2 Add `config.json` and `nginx/ssl/` to `.gitignore` (keep secrets out of git)
- [x] 2.3 Edit `Dockerfile`: add `appuser` (UID 1000) and `USER appuser`; stop COPYing config and rely on a runtime-mounted `config.json`

## 3. Production Compose stack

- [x] 3.1 Create `docker-compose.prod.yml` with service `gemini-web2api` (`build: .`, `network_mode: host`, mount `./config.json:/app/config.json:ro`, `restart: unless-stopped`)
- [x] 3.2 Add service `nginx` (`image: nginx:stable`, `network_mode: host`, mount site config + `nginx/ssl/`, `restart: unless-stopped`, `depends_on` app)

## 4. External API key & Nginx config

- [x] 4.1 Generate a random external key with `openssl rand -hex 24`
- [x] 4.2 Create `nginx/gemini-api.conf`: port 80 → 301 redirect to HTTPS
- [x] 4.3 Add port 443 server: load Origin cert/key, `map $http_authorization $ok` with the random key, return `401` when invalid
- [x] 4.4 Add `location /` proxy to `http://127.0.0.1:8081` with `Host`/`X-Forwarded-*` headers and `proxy_buffering off` for SSE

## 5. TLS via Cloudflare Origin Certificate

- [x] 5.1 Cloudflare Origin Certificate placed at `/root/server/cert/algieba12.cn.{pem,key}`; mounted read-only into the Nginx container
- [ ] 5.2 Set Cloudflare SSL/TLS mode to `Full (strict)` and enable Always Use HTTPS (dashboard action)

## 6. Launch & verify

- [x] 6.1 `docker compose -f docker-compose.prod.yml up -d --build` and confirm both containers are `running`
- [x] 6.2 Verify `curl http://127.0.0.1:8081/` returns status ok; app binds only `127.0.0.1:8081` (not public)
- [x] 6.3 Verify app process runs as non-root (`uid=1000(appuser)`)
- [x] 6.4 Verify `/v1/models` with valid key → 200, missing/wrong key → 401 (origin + public via Cloudflare)
- [x] 6.5 Verify a streaming completion (`stream: true`) returns incremental chunks through Nginx

## 7. Git auto-update

- [x] 7.1 Create `scripts/auto-update.sh`: `git fetch`, pull only if behind, then `docker compose -f docker-compose.prod.yml up -d --build`, logging output
- [x] 7.2 Create systemd `gemini-update.service` (oneshot) running the script
- [x] 7.3 Create systemd `gemini-update.timer` (e.g. every 30 min); install & `systemctl enable --now` (host step)
- [x] 7.4 Run the script once manually and confirm a no-op when already up to date

## 8. Documentation

- [x] 8.1 Document deployment, key location, and update mechanism (e.g. in `DEPLOY.md` or README) for future operators
