## ADDED Requirements

### Requirement: External requests require a valid Bearer key
The reverse proxy SHALL require external requests to present a valid `Authorization: Bearer <key>` header, and SHALL reject requests with a missing or invalid key with HTTP `401`.

#### Scenario: Valid key accepted
- **WHEN** an external client sends a request with the correct `Authorization: Bearer <key>` header
- **THEN** the request is proxied to the application and a normal response is returned

#### Scenario: Missing key rejected
- **WHEN** an external client sends a request without an `Authorization` header
- **THEN** the proxy responds with HTTP `401` and does not forward the request

#### Scenario: Invalid key rejected
- **WHEN** an external client sends a request with an incorrect Bearer key
- **THEN** the proxy responds with HTTP `401` and does not forward the request

### Requirement: Internal loopback callers are unauthenticated
Callers connecting directly to the application on `127.0.0.1:8081` SHALL NOT require an API key, because the application runs with an empty `api_keys` list and the port is loopback-only.

#### Scenario: Loopback call without key succeeds
- **WHEN** a process on the host calls `http://127.0.0.1:8081/v1/models` without any Authorization header
- **THEN** the application returns a normal response

### Requirement: Randomly generated external key
The external API key SHALL be a randomly generated secret (e.g. via `openssl rand`) configured only in the Nginx auth gate, not committed to source control.

#### Scenario: Key generated and stored securely
- **WHEN** the deployment is set up
- **THEN** a random key is generated and referenced by the Nginx configuration
- **AND** the key is not committed to the git repository
