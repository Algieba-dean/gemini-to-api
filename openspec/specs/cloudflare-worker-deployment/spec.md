# cloudflare-worker-deployment Specification

## Purpose

Define the Cloudflare Worker deployment that proxies OpenAI- and Google-native API requests to the Gemini Web StreamGenerate backend, including routing, request/response translation, streaming, and authorization/configuration handling.

## Requirements

### Requirement: API Route Mapping
The Cloudflare Worker proxy SHALL intercept incoming HTTP requests and route them as follows:
- `POST /v1/chat/completions` -> OpenAI chat completions handler
- `GET /v1/models` -> OpenAI models list handler
- `GET /v1beta/models` -> Google native models list handler
- `POST /v1beta/models/{model}:generateContent` -> Google native non-streaming completion handler
- `POST /v1beta/models/{model}:streamGenerateContent` -> Google native streaming completion handler
Requests to any other path SHALL return a 404 Not Found response.

#### Scenario: Route matching for chat completions
- **WHEN** client sends a `POST` request to `/v1/chat/completions`
- **THEN** system routes the request to the OpenAI chat completions handler

#### Scenario: Route matching for models list
- **WHEN** client sends a `GET` request to `/v1/models`
- **THEN** system routes the request to the OpenAI models list handler

### Requirement: Non-streaming Translation
The system SHALL parse incoming JSON bodies for non-streaming requests, construct the Gemini Web StreamGenerate payload (containing the messages, model identifier, and parameter tweaks), sign or attach headers (like cookie authorization or SAPISIDHASH if configured), perform the POST request to `https://gemini.google.com/_/BardChatUi/data/...`, extract the final text, and return it in the matching format.

#### Scenario: Successful non-streaming OpenAI request translation
- **WHEN** client sends `{"model":"gemini-3.5-flash","messages":[{"role":"user","content":"Hi"}]}` to `/v1/chat/completions`
- **THEN** system translates the query, fetches the response from Gemini Web, and returns an OpenAI-compatible JSON structure with a `choices` array

### Requirement: Streaming (SSE) Translation
The system SHALL support server-sent events (SSE) streaming. For streaming requests, it SHALL stream the request body to the upstream Gemini Web endpoint, decode upstream chunks (looking for the `"wrb.fr"` signature and extracting textual updates), clean internal execution artifacts, and stream them back to the client as SSE chunks formatted as `data: {...}` lines.

#### Scenario: Streaming OpenAI completion translation
- **WHEN** client sends a request with `"stream": true` to `/v1/chat/completions`
- **THEN** system responds with `text/event-stream` and streams incremental data blocks containing content deltas, ending with `data: [DONE]`

### Requirement: Authorization and Configuration Control
The system SHALL read its environment variables (such as `API_KEYS` and optional `COOKIE` / `SAPISID`). If `API_KEYS` is non-empty, it SHALL validate the client's `Authorization: Bearer <key>` header, returning a 401 Unauthorized response if invalid or missing. If `COOKIE` or `SAPISID` are set, it SHALL build the appropriate `Cookie` and `Authorization: SAPISIDHASH` headers for upstream requests.

#### Scenario: Request with missing required API key
- **WHEN** client sends a request without `Authorization` header when `API_KEYS` environment variable is configured
- **THEN** system rejects the request with a 401 Unauthorized response
