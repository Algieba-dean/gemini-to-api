## Why

The current project `gemini-web2api` is implemented in Python, requiring users to run a local python script or host a container to proxy the requests. By providing a Cloudflare Worker implementation, we enable users to deploy the service in a serverless environment for free, with high availability, global low-latency distribution, and zero local hosting requirements.

## What Changes

- Port the core proxy API endpoints (`/v1/chat/completions`, `/v1/models`, `/v1beta/*`) from Python to TypeScript/JavaScript.
- Re-implement the Google Gemini web StreamGenerate request formation, cookie/SAPISID hashing, and chunk response decoding/cleaning logic in JavaScript.
- Build the web server using Hono framework or vanilla Cloudflare Workers API.
- Support standard environment configuration (API keys, custom cookies, etc.) via Cloudflare environment variables or secrets.
- Maintain compatibility with SSE (Server-Sent Events) streaming format for OpenAI clients.

## Capabilities

### New Capabilities
- `cloudflare-worker-deployment`: A Cloudflare Worker proxy that intercepts OpenAI API format / Google native API format requests and translates them to Gemini Web's streaming format, providing a serverless deployment of gemini-web2api.

### Modified Capabilities
*(None)*

## Impact

- **New files**: TypeScript/JavaScript source files, `package.json` for npm packages/dependencies, `wrangler.toml` for Cloudflare Workers deployment configuration.
- **APIs**: The API endpoints and response structure will remain identical to the Python implementation.
- **Python Codebase**: The Python backend remains unaffected and can still be used for local Python deployments.
