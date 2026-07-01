# gemini-web2api

<p align="center">
  <img src="logo.png" width="200" alt="gemini-web2api logo">
</p>

[中文文档](README_CN.md)

Convert Google Gemini's web interface into an OpenAI-compatible API. Zero cost, cross-platform, single file.

## Features

- **Optional API Keys**: no auth when `api_keys` is empty, OpenAI-style Bearer auth when configured
- **OpenAI Compatible**: Drop-in replacement for `/v1/chat/completions` and `/v1/models`
- **Tool Calling**: Full function calling support (OpenAI format)
- **Structured Output**: `response_format` `json_object` / `json_schema` (and Google `responseMimeType`/`responseSchema`); works with LangChain `with_structured_output`
- **Multiple Models**: Flash, Flash Thinking (20k+ char output), Pro, Auto, Lite
- **Thinking Depth**: Adjustable via `@think=N` suffix (0=deepest, 4=shallowest)
- **Web Search**: Built-in internet access (Gemini's native search)
- **Cross-Platform**: Pure Python, single optional dependency (`httpx` for streaming)
- **Streaming**: SSE streaming support via `httpx`
- **Codex CLI**: Responses API (`/v1/responses`) for OpenAI Codex integration
- **Gemini CLI**: Google native API (`/v1beta/models`) for Gemini CLI compatibility

## Quick Start

```bash
pip install httpx
python gemini_web2api.py
```

Server starts at `http://localhost:8081/v1`.

## Client Configuration

### Cherry Studio / ChatBox / any OpenAI client

| Field | Value |
|-------|-------|
| Base URL | `http://localhost:8081/v1` |
| API Key | any `api_keys` value from `config.json`; anything if not configured |
| Model | `gemini-3.5-flash-thinking` |

### curl

```bash
curl http://localhost:8081/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-key" \
  -d '{"model":"gemini-3.5-flash","messages":[{"role":"user","content":"Hello!"}]}'
```

### OpenAI Python SDK

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8081/v1", api_key="sk-your-key")
resp = client.chat.completions.create(
    model="gemini-3.5-flash-thinking",
    messages=[{"role": "user", "content": "Explain quantum computing"}]
)
print(resp.choices[0].message.content)
```

### Gemini CLI

```bash
export GEMINI_API_KEY=none
export GOOGLE_GEMINI_BASE_URL=http://localhost:8081
gemini
```

Supports Google native API endpoints:
- `GET /v1beta/models` — list models
- `POST /v1beta/models/{model}:generateContent` — non-streaming
- `POST /v1beta/models/{model}:streamGenerateContent` — streaming (SSE)

## Available Models

| Model | Description | Output |
|-------|-------------|--------|
| `gemini-3.5-flash` | Fast general-purpose | ~12k chars |
| `gemini-3.5-flash-thinking` | Deep thinking, longest output | **~20k chars** |
| `gemini-3.5-flash-thinking-lite` | Adaptive thinking depth | ~15k chars |
| `gemini-3.1-pro` | Pro (needs cookie for real routing) | ~12k chars |
| `gemini-auto` | Auto model selection | varies |
| `gemini-flash-lite` | Lightweight fast | ~10k chars |

### Thinking Depth

Append `@think=N` to any model name:

```
gemini-3.5-flash-thinking@think=0   # deepest (default)
gemini-3.5-flash-thinking@think=2   # medium
gemini-3.5-flash-thinking@think=4   # shallowest
```

## Optional: Cookie for Pro

Anonymous access works for all models, but `gemini-3.1-pro` routes to Flash without authentication. To get real Pro routing, you need a **Gemini Advanced (paid subscription)** account cookie:

```bash
python gemini_web2api.py --cookie-file cookie.txt
```

### How to get cookies

1. Open Chrome, go to [gemini.google.com](https://gemini.google.com) and sign in with a **Gemini Advanced** Google account
2. Open DevTools (F12) → Application → Cookies → `https://gemini.google.com`
3. Copy these cookie values: `SID`, `HSID`, `SSID`, `APISID`, `SAPISID`, `__Secure-1PSID`
4. Create `cookie.txt` in this format:

```
SID=your_sid_value; HSID=your_hsid_value; SSID=your_ssid_value; APISID=your_apisid_value; SAPISID=your_sapisid_value; __Secure-1PSID=your_1psid_value
```

Or use the JSON format:
```json
{"cookie": "SID=xxx; HSID=xxx; SSID=xxx; APISID=xxx; SAPISID=xxx; __Secure-1PSID=xxx", "sapisid": "your_sapisid_value"}
```

**Alternative (browser extension)**: Use any "Export Cookies" extension to export cookies for `gemini.google.com` in Netscape format, then convert to the single-line format above.

### Authenticated account path and XSRF token

If the signed-in Gemini page URL contains an account index, such as:

```
https://gemini.google.com/u/1/app/...
```

set `auth_user` to that index. Authenticated web requests may also require the page XSRF token. In the rendered Gemini page source, this token is exposed as `SNlM0e`; pass it as `xsrf_token` in `config.json`. The server sends it as the `at` form field.

Example:

```json
{
  "cookie_file": "/app/cookie.txt",
  "auth_user": "1",
  "xsrf_token": "AOOh0P...",
  "gemini_bl": "boq_assistant-bard-web-server_YYYYMMDD.xx_p0"
}
```

If authenticated requests return HTTP 400 with an `xsrf` error, refresh Gemini Web, update `xsrf_token`, and make sure `auth_user` matches the `/u/<index>/` part of the browser URL.

Pro routing requires **Gemini Advanced** (paid subscription). A free Google account cookie will authenticate but silently fall back to Flash.

## Configuration

Create `config.json` in the same directory:

```json
{
  "port": 8081,
  "host": "0.0.0.0",
  "retry_attempts": 3,
  "retry_delay_sec": 2,
  "request_timeout_sec": 180,
  "gemini_bl": "boq_assistant-bard-web-server_20260525.09_p0",
  "auth_user": null,
  "xsrf_token": null,
  "api_keys": ["sk-your-key"],
  "cookie_file": null,
  "proxy": null,
  "log_requests": true
}
```

When `api_keys` is `[]`, authentication is disabled. When one or more keys are set, `/v1/*` endpoints require `Authorization: Bearer <key>` or `x-api-key: <key>`.

## Docker

```bash
cp config.example.json config.json
docker build -t gemini-web2api .
docker run -d --name gemini-web2api -p 8081:8081 -v ./config.json:/app/config.json gemini-web2api
```

Or use Docker Compose:

```bash
cp config.example.json config.json
docker compose up -d
```

To mount a cookie file:

```bash
docker run -d --name gemini-web2api -p 8081:8081 -v ./config.json:/app/config.json -v ./cookie.txt:/app/cookie.txt gemini-web2api
```

Set `"cookie_file": "/app/cookie.txt"` in `config.json`.

> **Note**: If you get empty responses (`content: null`) with Docker's default bridge network, switch to host networking: `docker run --network host ...` or add `network_mode: host` in your compose file. This is caused by Gemini's upstream rejecting requests from certain Docker NAT IP ranges.

## Production Deployment (Docker + Nginx + TLS)

A hardened, internet-facing deployment: an Nginx reverse proxy terminates TLS and
enforces a Bearer-token API key, proxying to the app which listens only on
loopback. Everything is driven by a `.env` file (no hardcoded domain, paths, or
keys), so the host only needs Docker. See [`DEPLOY.md`](DEPLOY.md) for the full guide.

**Architecture**

- **App container** — host networking, binds `${APP_HOST}:${APP_PORT}` (default `127.0.0.1:8081`), runs as a non-root user, `api_keys=[]` (internal/loopback callers need no key).
- **Nginx container** — host networking, terminates TLS on 80/443, redirects HTTP→HTTPS, requires `Authorization: Bearer ${API_KEY}` for external requests (otherwise `401`), and streams SSE without buffering.
- **TLS** — any certificate works (Cloudflare Origin Certificate or Let's Encrypt).

**Steps**

```bash
# 1. Install Docker Engine + compose plugin
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# 2. Configure (all values live in .env / config.json, both gitignored)
cp .env.example .env
cp config.example.json config.json
#   - .env: set SERVER_NAME, CERT_DIR, SSL_CERT_FILE, SSL_CERT_KEY_FILE, API_KEY
#            generate a key with:  openssl rand -hex 24
#   - config.json: set "host"/"port" to APP_HOST/APP_PORT, and "api_keys": []

# 3. Put your TLS cert + key inside CERT_DIR
ls "$CERT_DIR"   # must contain $SSL_CERT_FILE and $SSL_CERT_KEY_FILE

# 4. Build & start the stack
docker compose -f docker-compose.prod.yml up -d --build

# 5. (Optional) enable auto-update via a systemd timer (default: every 30min)
sudo bash scripts/install-systemd.sh 30min
```

If you front it with Cloudflare (proxied), set SSL/TLS mode to **Full (strict)** and enable **Always Use HTTPS**.

**Verify**

```bash
# internal, no key -> 200
curl http://${APP_HOST}:${APP_PORT}/
# external with key -> 200
curl https://${SERVER_NAME}/v1/models -H "Authorization: Bearer ${API_KEY}"
# external without key -> 401
curl -i https://${SERVER_NAME}/v1/models
```

**Rotate the API key**: edit `API_KEY` in `.env`, then re-render Nginx:

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
```

**Auto-update**: `scripts/auto-update.sh` runs `git pull` and rebuilds the stack only when the remote has new commits; `scripts/install-systemd.sh` wires it to a systemd timer (logs to `.auto-update.log`).

## Cloudflare Worker Deployment

Run gemini-web2api serverlessly on Cloudflare Workers — free, globally distributed,
and always-on. The Worker is a TypeScript/Hono port under [`worker/`](worker/). Full
guide: [`worker/DEPLOY.md`](worker/DEPLOY.md).

**Prerequisites**: a Cloudflare account and Node.js 18+.

```bash
cd worker
npm install                # install dependencies (node_modules is gitignored)

# Configure secrets/vars (recommended: store secrets encrypted)
npx wrangler secret put API_KEYS   # comma-separated keys, e.g. sk-key1,sk-key2
npx wrangler secret put COOKIE     # optional: Gemini Advanced cookie for Pro routing
npx wrangler secret put SAPISID    # optional (auto-extracted from COOKIE if omitted)

# Log in and deploy
npx wrangler login
npm run deploy
```

Deployment prints your URL, e.g. `https://gemini-web2api.<subdomain>.workers.dev`.

**API key auth**: when `API_KEYS` is empty the Worker is **open** (no auth). Once set,
auth is enforced on both OpenAI-compatible (`/v1/*`) and Google-native (`/v1beta/*`)
endpoints. The key may be supplied via any of:

- `Authorization: Bearer <key>` (OpenAI style)
- `x-api-key: <key>`
- `x-goog-api-key: <key>` (Google Gemini style)
- `?key=<key>` (Google Gemini query param)

**Local dev**: `npm run dev` starts a local server at `http://localhost:8787`. Put
`API_KEYS=sk-test` in `worker/.dev.vars` (gitignored) to test auth locally.

**Verify**

```bash
# without key -> 401 (when API_KEYS is set)
curl -i https://gemini-web2api.<subdomain>.workers.dev/v1/models
# with key -> 200
curl https://gemini-web2api.<subdomain>.workers.dev/v1/models -H "Authorization: Bearer sk-your-key"
```

### Automated Git Deployment (Cloudflare Workers Builds)

Instead of running `npm run deploy` manually, connect your GitHub repo so every
`git push` to the production branch (`main`) **auto-builds and deploys**.

**Connect**: Cloudflare dashboard → **Workers & Pages** → your Worker → **Settings → Build → Connect** → authorize GitHub and pick the repo + production branch.

**Build configuration** (this repo keeps the Worker in a `worker/` subdirectory, so commands must `cd worker` first):

| Field | Value |
|-------|-------|
| Root directory | `/` |
| Build command | `cd worker && npm install` |
| Deploy command | `cd worker && npx wrangler deploy` |
| Version command | `cd worker && npx wrangler versions upload` |

> The **Version command** (used for non-production/preview branches) also needs the `cd worker &&` prefix — without it, wrangler can't find `wrangler.toml` at the repo root and the build fails. Alternatively, set **Root directory** to `worker` and drop the `cd worker &&` prefix from all three commands.

> **⚠️ Secrets must not live in `[vars]`**: auto-deploy runs `wrangler deploy` on every push, and `wrangler deploy` overwrites same-named variables with the values in `wrangler.toml`. If `API_KEYS` stayed in `[vars]` (even as `""`), each push would **wipe the encrypted secret** you set in the dashboard. This repo therefore keeps only the non-sensitive `GEMINI_BL` in `[vars]`; `API_KEYS`/`COOKIE`/`SAPISID` are managed as **encrypted Secrets**, which persist across CI deploys.

**Set the token via dashboard** (once; CI does not create secrets): **Settings → Variables and Secrets** → edit the existing `API_KEYS` (or **Add** a new **Secret**) → enter the token → **Encrypt** → **Save/Deploy**.

**Verify after the CI build finishes**:

```bash
curl -i https://<your-domain>/v1/models        # no key  -> 401
curl -i https://<your-domain>/v1beta/models     # no key  -> 401 (proves the latest code with /v1beta protection is deployed)
curl https://<your-domain>/v1/models -H "Authorization: Bearer sk-your-key"   # -> 200
```

## Proxy

If you cannot access `gemini.google.com` directly (connection timeout), configure a proxy:

**Method 1: CLI argument**
```bash
python gemini_web2api.py --proxy http://127.0.0.1:7890
```

**Method 2: config.json**
```json
{"proxy": "http://127.0.0.1:7890"}
```

**Method 3: Environment variable** (auto-detected)
```bash
export HTTPS_PROXY=http://127.0.0.1:7890
python gemini_web2api.py
```

Works with Clash, V2Ray, Shadowsocks, or any HTTP proxy.

## Tool Calling

```python
resp = client.chat.completions.create(
    model="gemini-3.5-flash",
    messages=[{"role": "user", "content": "What's the weather in Tokyo?"}],
    tools=[{
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get weather for a city",
            "parameters": {"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]}
        }
    }]
)
```

## Structured Output

The API honors OpenAI `response_format` on `/v1/chat/completions`:

```python
from pydantic import BaseModel
class Person(BaseModel):
    name: str
    age: int

# LangChain / LangGraph — default method now works
structured = llm.with_structured_output(Person)
print(structured.invoke("Alice is thirty years old."))  # Person(name='Alice', age=30)
```

```bash
curl http://localhost:8081/v1/chat/completions -H "Content-Type: application/json" -d '{
  "model": "gemini-3.5-flash",
  "response_format": {"type": "json_schema", "json_schema": {"schema": {"type":"object","properties":{"name":{"type":"string"},"age":{"type":"integer"}},"required":["name","age"]}}},
  "messages": [{"role": "user", "content": "Bob is 45."}]
}'
```

- Supports `{"type":"json_object"}` and `{"type":"json_schema", ...}`.
- Google-native endpoints support `generationConfig.responseMimeType: "application/json"` and `responseSchema`.
- Implemented via prompt-instruction + robust JSON extraction (strips Markdown fences / surrounding prose), so it is **best-effort** rather than grammar-constrained. For maximum reliability with complex schemas, `with_structured_output(Schema, method="function_calling")` also works.

## Generation Parameters

The `/v1/chat/completions` endpoint honors these OpenAI parameters:

- **`max_tokens` / `max_completion_tokens`**: output is truncated (best-effort, token-based) and `finish_reason` becomes `length`.
- **`stop`**: string or list; output is cut at the first stop sequence.
- **`stream_options: {"include_usage": true}`**: a final usage-only chunk is emitted during streaming.
- **Token usage**: counted with `tiktoken` (`cl100k_base`) when installed, otherwise a ~4 chars/token estimate. Counts are approximate for Gemini.

Sampling params (`temperature`, `top_p`, `seed`, `presence_penalty`, `frequency_penalty`, `logit_bias`, `n`, `logprobs`) are accepted but **ignored** — the Gemini web backend does not expose them.

## Limitations

- **No image/multimodal input** (OpenAI path): image upload requires an authenticated Gemini session; the OpenAI `image_url` path currently ignores images. (The Google-native `inlineData` path can upload when a cookie is configured.)
- **Not real Pro/Ultra**: Without a paid subscription cookie, `gemini-3.1-pro` routes to the same Flash model. The "Pro" label is a UI preference, not a backend model switch.
- **Single-turn only**: Each request is an independent conversation. Multi-turn context is simulated by including previous messages in the prompt.
- **Rate limits**: Google may throttle high-frequency requests. The server retries automatically but sustained heavy use may be blocked.

## Requirements

- Python 3.8+
- `httpx` (`pip install httpx`) — used for streaming requests
- `tiktoken` (optional) — accurate token usage counting; falls back to an estimate if missing
- Network access to `gemini.google.com` (proxy/VPN may be needed in some regions)

## How It Works

This tool reverse-engineers Google Gemini's web StreamGenerate protocol. It sends requests to the same endpoint that the Gemini web app uses, converting between OpenAI's API format and Gemini's internal protobuf-like format.

The model selection is controlled by field `[79]` in the request payload, mapped from Gemini's frontend JavaScript source (`MODE_CATEGORY` enum).

## Acknowledgments

- Inspired by the open-source API proxy ecosystem

## License

MIT

---

## 致谢

本项目的开发 agent 能力由 [GenericAgent](https://github.com/lsdefine/GenericAgent) 提供。

### 🚩 友情链接

[![GenericAgent](https://img.shields.io/badge/Agent_Framework-GenericAgent-orange?style=for-the-badge&logo=github)](https://github.com/lsdefine/GenericAgent)
[![LinuxDo](https://img.shields.io/badge/社区-LinuxDo-blue?style=for-the-badge)](https://linux.do/)
