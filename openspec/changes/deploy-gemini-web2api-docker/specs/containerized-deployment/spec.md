## ADDED Requirements

### Requirement: Containerized service stack
The deployment SHALL run `gemini_web2api` and its reverse proxy as Docker containers orchestrated by a single Docker Compose file, so the host requires only Docker Engine and the compose plugin (no host-level Python or Nginx packages).

#### Scenario: Stack starts from compose
- **WHEN** an operator runs `docker compose -f docker-compose.prod.yml up -d --build`
- **THEN** both the application container and the Nginx container start and report `running`
- **AND** no Python runtime or Nginx package is installed directly on the host

#### Scenario: Containers restart automatically
- **WHEN** a container exits unexpectedly or the host reboots
- **THEN** Docker restarts the containers (restart policy `unless-stopped`) without manual intervention

### Requirement: Application bound to loopback on host network
The application container SHALL use host networking and bind only to `127.0.0.1:8081`, so the application port is never directly exposed to the public internet.

#### Scenario: App reachable only on loopback
- **WHEN** the stack is running
- **THEN** `curl http://127.0.0.1:8081/` on the host returns a status `ok` JSON response
- **AND** the application port `8081` is not reachable from the public IP

#### Scenario: Host networking avoids empty responses
- **WHEN** the application sends a request to `gemini.google.com`
- **THEN** it connects via the host network (not Docker bridge NAT) so upstream responses are not silently dropped

### Requirement: Non-root application process
The application process SHALL run as a non-root user inside its container.

#### Scenario: Process runs as non-root
- **WHEN** an operator inspects the running application container (e.g. `docker exec ... id`)
- **THEN** the application process owner is a non-root user (UID != 0)
