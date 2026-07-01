## 1. Shared JSON extraction (Python)

- [x] 1.1 Add `extract_json(text)` helper in `gemini_web2api/tools.py` that strips ```` ``` ```` / ```` ```json ```` fences and returns the first balanced JSON value (`{...}` or `[...]`), falling back to the trimmed text
- [x] 1.2 Add a `build_json_instruction(response_format)` helper that returns the injected prompt text for `json_object` and `json_schema` (embedding the schema when present)

## 2. OpenAI path — Python server

- [x] 2.1 In `_handle_chat` (`gemini_web2api/server.py`), read `response_format`; when present, append `build_json_instruction(...)` to the prompt via `messages_to_prompt`
- [x] 2.2 After `generate(...)`, when JSON output was requested, run `extract_json` on the text before building the response (both streaming and non-streaming branches)
- [x] 2.3 Ensure absence of `response_format` leaves the code path and output byte-for-byte unchanged

## 3. Google-native path — Python server

- [x] 3.1 In `_handle_google_generate`, read `generationConfig.responseMimeType`/`responseSchema`; when JSON is requested, inject the instruction into the prompt
- [x] 3.2 Apply `extract_json` to the candidate text for both `generateContent` and `streamGenerateContent` (assemble-then-emit for stream)

## 4. Worker (TypeScript) — parity

- [x] 4.1 Add `extractJson(text)` and `buildJsonInstruction(responseFormat)` helpers in `worker/src/index.ts` mirroring the Python behavior/strings
- [x] 4.2 Honor `response_format` in the `POST /v1/chat/completions` handler (inject instruction, extract JSON from output)
- [x] 4.3 Honor `generationConfig.responseMimeType`/`responseSchema` in the `/v1beta` generate handler(s)
- [x] 4.4 Verify the Worker builds (`npx tsc --noEmit`: no new errors beyond 3 pre-existing thinkMode warnings; esbuild build unaffected) (`npx tsc --noEmit` / `wrangler deploy --dry-run`) with no new type errors

## 5. Verification

- [x] 5.1 Rebuild the container (`docker compose -f docker-compose.prod.yml up -d --build`) or restart the local app
- [x] 5.2 Run `/tmp/lc_test.py` — all 8 tests PASS (incl. #4 default and #6 json_schema, previously failing) and confirm tests #4 (default) and #6 (`json_schema`) now PASS, others still PASS
- [x] 5.3 curl `POST /v1/chat/completions` with `json_object` and `json_schema` → assert content parses as JSON with no fences
- [x] 5.4 curl `POST /v1beta/models/{model}:generateContent` with `responseMimeType: application/json` → assert JSON text
- [x] 5.5 Start `wrangler dev` and repeat the `json_object` + `json_schema` requests against the Worker; confirm equivalent JSON results

## 6. Documentation

- [x] 6.1 Document structured-output support and behavior/limitations in `README.md` and `README_CN.md`
- [x] 6.2 Note Worker support in `worker/DEPLOY.md`
- [x] 6.3 Update the "Limitations" section to reflect that `response_format` is now supported (best-effort)
