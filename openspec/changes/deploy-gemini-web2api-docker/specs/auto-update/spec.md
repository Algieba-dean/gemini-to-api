## ADDED Requirements

### Requirement: Automated git pull and rebuild
The deployment SHALL provide a script that fetches the latest code from git and, when updates exist, rebuilds and restarts the Docker Compose stack.

#### Scenario: Update applied when remote changes
- **WHEN** the auto-update script runs and the remote branch has new commits
- **THEN** the script pulls the changes and runs `docker compose -f docker-compose.prod.yml up -d --build`
- **AND** the running containers reflect the updated code

#### Scenario: No-op when up to date
- **WHEN** the auto-update script runs and the local checkout already matches the remote
- **THEN** the script makes no changes and does not restart the containers

### Requirement: Scheduled execution via systemd timer
The auto-update script SHALL be executed on a recurring schedule by a host systemd timer, and SHALL log its activity.

#### Scenario: Timer triggers update
- **WHEN** the systemd timer fires on its schedule
- **THEN** the oneshot update service runs the auto-update script
- **AND** the run outcome is written to a log

#### Scenario: Timer enabled on boot
- **WHEN** the host reboots
- **THEN** the systemd timer is enabled and resumes its schedule automatically
