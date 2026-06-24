## 1. Project Setup and Infrastructure

- [x] 1.1 Create `worker/` directory for the Cloudflare Worker codebase.
- [x] 1.2 Initialize `package.json` with dependencies: `hono`, and devDependencies: `wrangler`, `typescript`, `@cloudflare/workers-types`.
- [x] 1.3 Create `tsconfig.json` configured for Cloudflare Workers.
- [x] 1.4 Create `wrangler.toml` specifying project configuration, entry point, and environment variable schema.

## 2. Core Gemini Web Protocol Porting

- [x] 2.1 Implement SHA-1 hashing and the `makeSapisidHash` utility using the Web Crypto API.
- [x] 2.2 Re-implement prompt parsing utilities (converting OpenAI messages to a single prompt, converting Google contents format to a single prompt).
- [x] 2.3 Re-implement tool call parser (extracting `tool_call` markdown blocks from response text into OpenAI JSON format).
- [x] 2.4 Re-implement response text cleaning (`cleanGeminiText` to strip python/javascript/text execution artifacts).

## 3. Router and Authentication Middleware

- [x] 3.1 Initialize the Hono application in `src/index.ts`.
- [x] 3.2 Implement API keys authentication middleware to intercept `/v1/*` requests and validate the Authorization Bearer token.
- [x] 3.3 Add models list endpoints: `GET /v1/models` and `GET /v1beta/models` matching the models mapping.
- [x] 3.4 Implement metadata home page: `GET /` returning server version and status.

## 4. Request Processing and Stream Generating

- [x] 4.1 Implement upstream POST request building for `StreamGenerate`, attaching cookies and SAPISID headers when provided.
- [x] 4.2 Re-implement the stream chunk extraction logic: read `ReadableStream` line by line, check for `wrb.fr` patterns, and decode.
- [x] 4.3 Implement `POST /v1/chat/completions` handling (parsing OpenAI requests, determining model, resolving stream vs non-stream, streaming formatted SSE blocks or returning full JSON).
- [x] 4.3 Implement `POST /v1/responses` handling (OpenAI Codex format translation and completions).
- [x] 4.4 Implement Google native completions handling (`POST /v1beta/models/:model:generateContent` and `POST /v1beta/models/:model:streamGenerateContent`).

## 5. Verification and Testing

- [x] 5.1 Run local development server using `wrangler dev` and test connectivity.
- [x] 5.2 Verify non-streaming and streaming `/v1/chat/completions` endpoints with an OpenAI client or `curl`.
- [x] 5.3 Verify Google native generate endpoints with a client or `curl`.


