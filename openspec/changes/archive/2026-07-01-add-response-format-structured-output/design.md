## Context

The API reverse-engineers Gemini's web StreamGenerate protocol; it has no native JSON-mode or schema-constrained decoding. Model output is free text. There are two deployments that must stay in parity: the Python server (`gemini_web2api/`, the container entrypoint `python -m gemini_web2api`) and the Cloudflare Worker (`worker/src/index.ts`, TypeScript/Hono).

Today `response_format` is dropped when parsing requests, so OpenAI/LangChain structured output fails. The only reliable lever we have is (a) prompt injection to steer the model toward JSON and (b) robust post-processing to extract clean JSON from the text (models frequently wrap JSON in ```` ```json ```` fences or add prose).

## Goals / Non-Goals

**Goals:**
- Make `response_format` (`json_object`, `json_schema`) work on `POST /v1/chat/completions` in both the Python server and the Worker.
- Support Google-native `generationConfig.responseMimeType`/`responseSchema` on `/v1beta` endpoints in both deployments.
- Reliably return directly-parseable JSON (strip fences, trim prose).
- Backward compatible: absence of `response_format` changes nothing.

**Non-Goals:**
- True constrained/grammar-based decoding (impossible via the web protocol).
- Guaranteed 100% schema conformance — best-effort via prompting + extraction. No hard server-side rejection/re-ask loop in v1.
- Adding new runtime dependencies (no jsonschema validator library).
- Streaming incremental JSON validation — JSON mode returns the assembled result.

## Decisions

- **Prompt injection + output extraction (not decoding).** Inject a system-level instruction: for `json_object`, "Respond with ONLY a single valid JSON value, no prose, no Markdown fences." For `json_schema`, additionally embed the JSON Schema and require conformance. Rationale: the web protocol gives no other control surface. Alternative (reject non-conforming output) adds latency and complexity; deferred.
- **Shared extraction routine.** Implement a `extract_json`/`stripJsonFences` helper: remove ```` ``` ```` / ```` ```json ```` fences, then scan for the first balanced JSON value (`{...}` or `[...]`) and return it. Apply only when JSON output was requested to avoid altering normal responses. Rationale: models are inconsistent about fences/prose; a single tested routine keeps Python and Worker consistent.
- **Reuse existing prompt builders.** Extend `messages_to_prompt` (OpenAI path) and `google_contents_to_prompt` / handler (Google path) to append the JSON instruction, rather than threading a new parameter through `generate`. Keeps the upstream call path unchanged.
- **Parity by mirroring, not sharing.** Python and TS cannot share code; keep the instruction text and extraction logic behaviorally identical and cover both with the same test matrix. Rationale: two runtimes, one contract.
- **Where the schema comes from.** OpenAI `json_schema` schema lives at `response_format.json_schema.schema`; Google schema at `generationConfig.responseSchema`. Normalize both into the same injected-instruction format.

## Risks / Trade-offs

- **Model still emits prose or invalid JSON occasionally** → Mitigation: strong instruction + robust first-balanced-value extraction; document as best-effort. Callers using LangChain get parse errors only in rare cases (same as any prompted JSON mode).
- **Fence-stripping corrupts legitimate content** → Mitigation: only post-process when JSON output was explicitly requested; never touch normal responses.
- **Thinking models prepend reasoning text** → Mitigation: extraction scans for the first balanced JSON value after trimming; recommend non-thinking model for strict JSON in docs.
- **Python/Worker drift** → Mitigation: identical instruction strings + shared test cases run against both before merge.
- **Nested/streamed JSON in Google stream path** → Mitigation: for JSON mode on stream, assemble then emit (do not attempt per-chunk JSON validity).

## Migration Plan

1. Implement Python server changes; validate with `/tmp/lc_test.py` (default + `json_schema` + `json_mode`) and curl.
2. Implement Worker changes; validate locally via `wrangler dev` with the same requests.
3. Update docs (README EN/CN, `worker/DEPLOY.md`).
4. Deploy: rebuild container (`docker compose -f docker-compose.prod.yml up -d --build`) and push (Workers Builds auto-deploys). Rollback = revert commit / redeploy previous image; feature is additive so rollback is safe.

## Open Questions

- Should we add an optional best-effort schema validation + single re-ask retry when parsing fails? (Deferred to a follow-up; v1 is prompt + extraction only.)
- Should `strict: true` in `json_schema` change behavior beyond stronger prompting? (v1: same path, stronger wording.)
