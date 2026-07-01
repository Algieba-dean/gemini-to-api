## ADDED Requirements

### Requirement: Honor OpenAI `response_format` json_object

The system SHALL honor the OpenAI `response_format: {"type": "json_object"}` field on `POST /v1/chat/completions`, instructing the model to return only valid JSON and returning JSON as the assistant message content without Markdown code fences. This applies identically in the Python server and the Cloudflare Worker.

#### Scenario: json_object returns clean JSON

- **WHEN** a client sends `POST /v1/chat/completions` with `response_format: {"type": "json_object"}`
- **THEN** the assistant message `content` is a string that parses as valid JSON with no surrounding prose or ```` ```json ```` fences

#### Scenario: json_object absent leaves behavior unchanged

- **WHEN** a client sends a request without `response_format`
- **THEN** the response content is produced exactly as before (no JSON post-processing applied)

### Requirement: Honor OpenAI `response_format` json_schema

The system SHALL honor `response_format: {"type": "json_schema", "json_schema": {"schema": {...}}}` on `POST /v1/chat/completions` by injecting the schema into the upstream prompt, requiring the model to emit JSON conforming to that schema, and returning clean JSON as the message content. This applies identically in the Python server and the Cloudflare Worker.

#### Scenario: json_schema yields conformant JSON

- **WHEN** a client sends `response_format` of type `json_schema` with a schema requiring fields `name` (string) and `age` (integer)
- **THEN** the assistant message `content` parses as JSON containing `name` and `age` with the correct types

#### Scenario: LangChain default structured output works

- **WHEN** a LangChain client calls `with_structured_output(Schema)` using its default method (`json_schema`)
- **THEN** the parsed result is a valid instance of the schema rather than a JSON parse error

### Requirement: Reliable JSON extraction from model output

The system SHALL post-process model output when a JSON response is requested by stripping Markdown code fences and leading/trailing non-JSON prose, extracting the first complete JSON value so the returned content is directly parseable.

#### Scenario: Fenced JSON is unwrapped

- **WHEN** the model returns content wrapped in a ```` ```json ... ``` ```` fence
- **THEN** the returned content is the inner JSON with the fence removed

#### Scenario: Surrounding prose is trimmed

- **WHEN** the model returns explanatory text before or after a JSON object
- **THEN** the returned content is the JSON value alone

### Requirement: Honor Google `responseMimeType` and `responseSchema`

The system SHALL honor `generationConfig.responseMimeType: "application/json"` and optional `generationConfig.responseSchema` on the Google-native endpoints (`POST /v1beta/models/{model}:generateContent` and `:streamGenerateContent`), returning JSON text in the candidate parts. This applies identically in the Python server and the Cloudflare Worker.

#### Scenario: Google JSON mode returns JSON

- **WHEN** a client calls `:generateContent` with `generationConfig.responseMimeType: "application/json"` and a `responseSchema`
- **THEN** the candidate part `text` parses as JSON conforming to the schema

### Requirement: Parity between Python server and Cloudflare Worker

The system SHALL implement structured-output behavior consistently across the Python server and the Cloudflare Worker so a client receives equivalent results from either deployment.

#### Scenario: Same request, equivalent structured result

- **WHEN** the same `response_format` request is sent to the Python server and to the Worker
- **THEN** both return content that parses as valid JSON matching the requested format
