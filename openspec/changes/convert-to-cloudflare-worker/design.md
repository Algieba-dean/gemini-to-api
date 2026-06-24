## Context

The current `gemini-web2api` project is a Python application that runs a threaded HTTP server. To deploy it, users need to host it on a machine with Python installed or run it inside Docker.
Cloudflare Workers is a serverless platform that allows running JavaScript/TypeScript code globally at the edge. Porting the project to a Cloudflare Worker will enable serverless, zero-cost, high-availability, and maintenance-free deployment.

## Goals / Non-Goals

**Goals:**
- Port the proxy server logic to TypeScript and configure a Cloudflare Worker deployment structure using `wrangler`.
- Expose the same OpenAI-compatible endpoints: `POST /v1/chat/completions`, `GET /v1/models`, `POST /v1/responses`.
- Expose the Google native endpoints: `GET /v1beta/models`, `POST /v1beta/models/:model:generateContent`, `POST /v1beta/models/:model:streamGenerateContent`.
- Provide streaming (SSE) response handling using Cloudflare Worker's runtime streaming APIs.
- Allow configuring cookies/SAPISID/API keys via environment variables/secrets instead of local configuration files.

**Non-Goals:**
- Running Python code in Cloudflare Workers (the Python version will remain as a standalone script).
- Re-architecting how Gemini Web works or bypassing security restrictions that upstream Google Gemini may add in the future.

## Decisions

### 1. Framework: Hono
- **Choice**: Hono framework (`hono`).
- **Rationale**: Hono is lightweight, designed specifically for Cloudflare Workers, and has excellent TypeScript support. It simplifies routing, middleware (like Bearer Auth), CORS, and streaming responses out of the box compared to writing raw Worker fetch handlers.
- **Alternatives Considered**: Raw Cloudflare Worker `fetch` handler. While doable, raw handlers require manual regex/string routing and boilerplate request parsing, which Hono abstracts beautifully.

### 2. Runtime Environment & Build Tooling
- **Choice**: Wrangler CLI with npm, TypeScript, and modern JavaScript bundle compilation.
- **Rationale**: Standard tools for Cloudflare Workers. It handles compiling, bundling, local emulation, and deploying seamlessly.
- **Alternatives Considered**: None. Wrangler is the official and standard way to build Cloudflare Workers.

### 3. State/Config Storage
- **Choice**: Cloudflare Worker Environment Variables / Secrets.
- **Rationale**: Since Cloudflare Workers is a serverless environment, there is no persistent local file system to load config files or cookie files. The settings `API_KEYS`, `COOKIE`, `SAPISID`, and `GEMINI_BL` will be read directly from Worker variables (which can be populated securely via Wrangler secrets).
- **Alternatives Considered**: KV Storage or D1 database. Too heavy-weight and expensive for storing static config like session cookies and API keys.

### 4. Cryptography for SAPISIDHASH
- **Choice**: Web Crypto API (`crypto.subtle`).
- **Rationale**: Cloudflare Workers environment provides Web Crypto API natively. We can compute SHA-1 hash for the SAPISIDHASH header without any external dependency.
- **Alternatives Considered**: Third-party `crypto-js` npm packages. Not needed since standard `crypto.subtle` is already built into the runtime.

## Risks / Trade-offs

- **[Risk] Upstream response changes** → Google changes the array structure of `BardChatUi/data` response.
  - *Mitigation*: The TS code structure will mirror the Python code, making it easy to apply upstream array index fixes simultaneously in both projects.
- **[Risk] Size limits on Workers** → Cloudflare Workers free plan has a 1MB script size limit.
  - *Mitigation*: Hono and minimal dependencies ensure the compiled bundle size will be less than 50KB, well within limits.
- **[Risk] Streaming response timeout** → Cloudflare Worker limits request execution time.
  - *Mitigation*: Standard HTTP streaming keeps the connection active and complies with Cloudflare limits for streaming requests.
