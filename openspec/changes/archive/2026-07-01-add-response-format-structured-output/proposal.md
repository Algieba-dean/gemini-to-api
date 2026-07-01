## Why

LangChain/LangGraph's `with_structured_output(Schema)` fails by default against our API because the server (and the Cloudflare Worker) silently ignore the OpenAI `response_format` field (`json_object` / `json_schema`). Clients get free-form prose that fails JSON parsing. Empirical testing confirmed default structured output and `method="json_schema"` both break, while only `function_calling` works. Supporting `response_format` makes structured output work out-of-the-box for the whole OpenAI/LangChain ecosystem.

## What Changes

- Parse and honor `response_format` on `POST /v1/chat/completions` for both `{"type":"json_object"}` and `{"type":"json_schema", "json_schema": {...}}`.
- Inject a strong instruction into the upstream prompt telling Gemini to output ONLY valid JSON (and, for `json_schema`, to conform to the provided JSON Schema).
- Post-process model output to reliably extract JSON: strip Markdown code fences (```json ... ```), trim surrounding prose, and return clean JSON as the message content.
- Apply the same JSON-fence cleanup generically so bare-JSON responses are not wrapped in fences.
- Mirror the identical behavior in the Cloudflare Worker (`worker/src/index.ts`) for `POST /v1/chat/completions`.
- Add equivalent support on the Google-native path for `generationConfig.responseMimeType: "application/json"` and `generationConfig.responseSchema` (`POST /v1beta/models/{model}:generateContent` and stream), in both the Python server and the Worker.
- Update README (EN/CN) and `worker/DEPLOY.md` to document structured-output support and behavior.

No breaking changes: when `response_format` is absent, behavior is unchanged.

## Capabilities

### New Capabilities
- `structured-output`: Honoring OpenAI `response_format` (json_object / json_schema) and Google `responseMimeType`/`responseSchema` so the API returns clean, schema-conformant JSON across the Python server and Cloudflare Worker.

### Modified Capabilities
<!-- None: no pre-existing specs in openspec/specs/. -->

## Impact

- **Python server**: `gemini_web2api/server.py` (`_handle_chat`, `_handle_google_generate`), `gemini_web2api/tools.py` (prompt construction), plus a small JSON-extraction helper (likely in `gemini_web2api/tools.py` or `gemini.py`).
- **Cloudflare Worker**: `worker/src/index.ts` (chat completions handler, google-native handler, response text cleanup).
- **Docs**: `README.md`, `README_CN.md`, `worker/DEPLOY.md`.
- **Clients**: LangChain `with_structured_output` (default + `json_schema` + `json_mode`), OpenAI SDK `response_format`, and any JSON-mode consumer. Backward compatible.
- **Dependencies**: none added (pure prompt-injection + output post-processing; optional lightweight schema validation without new deps).
