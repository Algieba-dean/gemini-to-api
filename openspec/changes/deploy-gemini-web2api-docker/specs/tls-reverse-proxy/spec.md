## ADDED Requirements

### Requirement: HTTPS reverse proxy
An Nginx reverse proxy SHALL terminate TLS for `gemini-api.algieba12.cn` and forward valid requests to the local application at `http://127.0.0.1:8081`.

#### Scenario: HTTPS request is proxied
- **WHEN** a client sends an authorized HTTPS request to `https://gemini-api.algieba12.cn/v1/models`
- **THEN** Nginx terminates TLS and proxies the request to the local application
- **AND** the application response is returned to the client

#### Scenario: HTTP redirected to HTTPS
- **WHEN** a client connects over plain HTTP on port 80
- **THEN** Nginx responds with a 301 redirect to the `https://` URL

### Requirement: Cloudflare Origin Certificate TLS
The reverse proxy SHALL present a Cloudflare Origin Certificate for the origin TLS connection, and Cloudflare SHALL be configured in `Full (strict)` SSL mode.

#### Scenario: Origin certificate served
- **WHEN** Cloudflare connects to the origin over TLS
- **THEN** Nginx presents the Cloudflare Origin Certificate and the connection succeeds under `Full (strict)` mode

#### Scenario: Edge certificate auto-renewed
- **WHEN** the Cloudflare edge certificate approaches expiry
- **THEN** Cloudflare renews it automatically with no action required on the origin (Origin Certificate validity is 15 years)

### Requirement: Streaming responses pass through
The reverse proxy SHALL support Server-Sent Events streaming from the application without buffering.

#### Scenario: SSE streaming works through proxy
- **WHEN** a client requests a streaming completion (`stream: true`)
- **THEN** Nginx forwards incremental chunks to the client without buffering the full response
