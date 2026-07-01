import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { streamText } from 'hono/streaming';
import {
  makeSapisidHash,
  messagesToPrompt,
  googleContentsToPrompt,
  parseToolCalls,
  cleanGeminiText,
  Message
} from './utils';

const DEFAULT_MODEL = "gemini-3.5-flash";

const MODELS: Record<string, { mode: number; think: number; desc: string }> = {
  "gemini-3.5-flash": {
    mode: 1, think: 4,
    desc: "Fast general-purpose model",
  },
  "gemini-3.5-flash-thinking": {
    mode: 2, think: 0,
    desc: "Deep thinking mode, longest output (~20k chars)",
  },
  "gemini-3.1-pro": {
    mode: 3, think: 4,
    desc: "Pro model (requires cookie for real routing)",
  },
  "gemini-auto": {
    mode: 4, think: 4,
    desc: "Auto model selection",
  },
  "gemini-3.5-flash-thinking-lite": {
    mode: 5, think: 0,
    desc: "Dynamic thinking with adaptive depth",
  },
  "gemini-flash-lite": {
    mode: 6, think: 4,
    desc: "Lightweight fast model",
  },
};

type Bindings = {
  GEMINI_BL?: string;
  API_KEYS?: string;
  COOKIE?: string;
  SAPISID?: string;
  AUTH_USER?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS
app.use('*', cors());

// Authentication middleware. When API_KEYS is empty the API is open (no auth).
// Accepts the key via any of:
//   - Authorization: Bearer <key>   (OpenAI style)
//   - x-api-key: <key>
//   - x-goog-api-key: <key>         (Google Gemini style)
//   - ?key=<key>                    (Google Gemini query param)
const authMiddleware: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  const apiKeysStr = c.env.API_KEYS || "";
  if (!apiKeysStr) {
    return await next();
  }
  const apiKeys = apiKeysStr.split(",").map((k: string) => k.trim()).filter((k: string) => k);
  if (apiKeys.length === 0) {
    return await next();
  }

  const authHeader = c.req.header("Authorization") || "";
  let key = "";
  if (authHeader.startsWith("Bearer ")) {
    key = authHeader.substring(7);
  } else {
    key =
      c.req.header("x-api-key") ||
      c.req.header("x-goog-api-key") ||
      c.req.query("key") ||
      "";
  }

  if (!apiKeys.includes(key)) {
    return c.json({ error: { message: "invalid api key" } }, 401);
  }
  return await next();
};

// Protect both OpenAI-compatible (/v1/*) and Google-native (/v1beta/*) endpoints.
app.use('/v1/*', authMiddleware);
app.use('/v1beta/*', authMiddleware);

// ─── Structured output (response_format) helpers ───────────────────────────
// Build a prompt instruction for OpenAI response_format (json_object / json_schema).
function buildJsonInstruction(responseFormat: any): string {
  if (!responseFormat || typeof responseFormat !== "object") return "";
  const t = responseFormat.type;
  if (t === "json_object") {
    return "\n\n# Output Format\nRespond with ONLY a single valid JSON value. Do NOT include any explanatory text, comments, or Markdown code fences.";
  }
  if (t === "json_schema") {
    const js = responseFormat.json_schema || {};
    const schema = js.schema || js.json_schema || js;
    return "\n\n# Output Format\nRespond with ONLY a single valid JSON value that strictly conforms to the following JSON Schema. Do NOT include any explanatory text, comments, or Markdown code fences.\nJSON Schema:\n" + JSON.stringify(schema);
  }
  return "";
}

// Return the first balanced JSON object/array substring, or null.
function firstBalancedJson(s: string): string | null {
  let start = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "{" || s[i] === "[") { start = i; break; }
  }
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) {
        const candidate = s.substring(start, i + 1);
        try { JSON.parse(candidate); return candidate; } catch { return null; }
      }
    }
  }
  return null;
}

// Extract clean JSON from model output: strip fences and surrounding prose.
function extractJson(text: string): string {
  if (!text) return text;
  let s = text.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/.exec(s);
  if (fence) s = fence[1].trim();
  try { JSON.parse(s); return s; } catch { /* not bare JSON */ }
  const extracted = firstBalancedJson(s);
  return extracted !== null ? extracted : s;
}

// ─── Usage / stop / max_tokens helpers ─────────────────────────────────────
// Approximate token count (~4 chars/token). Workers cannot bundle a full
// tokenizer cheaply, so usage numbers are estimates.
function countTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

function trimToTokens(text: string, maxTokens: number): string {
  const budget = maxTokens * 4;
  return text.length <= budget ? text : text.substring(0, budget);
}

// Emulate OpenAI stop sequences + max_tokens on a full response.
function applyStopAndMax(text: string, stop: any, maxTokens: any): { text: string; finish: string } {
  let finish = "stop";
  if (!text) return { text, finish };
  if (stop) {
    const stops = Array.isArray(stop) ? stop : [stop];
    let cut = -1;
    for (const s of stops) {
      if (!s) continue;
      const i = text.indexOf(s);
      if (i !== -1 && (cut === -1 || i < cut)) cut = i;
    }
    if (cut !== -1) text = text.substring(0, cut);
  }
  if (maxTokens != null && countTokens(text) > maxTokens) {
    text = trimToTokens(text, maxTokens);
    finish = "length";
  }
  return { text, finish };
}

// Helper: Resolve model and think override
function resolveModel(modelName: string) {
  let name = modelName || DEFAULT_MODEL;
  let thinkOverride: number | null = null;
  if (name.includes("@think=")) {
    const parts = name.split("@think=");
    name = parts[0];
    thinkOverride = parseInt(parts[1], 10);
  }
  const cfg = MODELS[name];
  if (!cfg) {
    return { error: `Unknown model: ${modelName}` };
  }
  return {
    modelName: name,
    mode: cfg.mode,
    think: thinkOverride !== null && !isNaN(thinkOverride) ? thinkOverride : cfg.think,
  };
}

// Helper: Get Google account routing path prefix
function accountPrefix(authUser?: string): string {
  if (!authUser || authUser === "") return "";
  return `/u/${authUser}`;
}

// Helper: Compute Upstream Headers
async function getUpstreamHeaders(env: Bindings): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    "Origin": "https://gemini.google.com",
    "Referer": `https://gemini.google.com${accountPrefix(env.AUTH_USER)}/app`,
    "X-Same-Domain": "1",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };
  if (env.AUTH_USER) {
    headers["X-Goog-AuthUser"] = env.AUTH_USER;
  }
  const cookieStr = env.COOKIE || "";
  let sapisid = env.SAPISID || "";
  if (!sapisid && cookieStr) {
    const match = /SAPISID=([^;]+)/.exec(cookieStr);
    const matchSec = /__Secure-1PAPISID=([^;]+)/.exec(cookieStr);
    sapisid = match ? match[1] : (matchSec ? matchSec[1] : "");
  }
  if (cookieStr) {
    headers["Cookie"] = cookieStr;
  }
  if (sapisid) {
    headers["Authorization"] = await makeSapisidHash(sapisid);
  }
  return headers;
}

// Helper: Build Gemini Upstream URL
function buildUpstreamUrl(env: Bindings): string {
  const reqid = Math.floor(Math.random() * 1000000);
  const prefix = accountPrefix(env.AUTH_USER);
  const bl = env.GEMINI_BL || "boq_assistant-bard-web-server_20260525.09_p0";
  return `https://gemini.google.com${prefix}/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=${bl}&hl=en&_reqid=${reqid}&rt=c`;
}

// Helper: Construct Request Payload for StreamGenerate
function buildGeminiPayload(prompt: string, modelId: number, thinkMode: number): string {
  const inner = new Array(80).fill(null);
  inner[0] = [prompt, 0, null, null, null, null, 0];
  inner[1] = ["en"];
  inner[2] = ["", "", "", null, null, null, null, null, null, ""];
  inner[6] = [0];
  inner[7] = 1;
  inner[10] = 1;
  inner[11] = 0;
  inner[17] = [[thinkMode]];
  inner[18] = 0;
  inner[27] = 1;
  inner[30] = [4];
  inner[41] = [2];
  inner[53] = 0;
  inner[59] = crypto.randomUUID();
  inner[61] = [];
  inner[68] = 1;
  inner[79] = modelId;

  const outer = [null, JSON.stringify(inner)];
  return new URLSearchParams({ "f.req": JSON.stringify(outer) }).toString();
}

// Helper: Extract complete text from raw Gemini response block
function extractResponseText(raw: string): string {
  if (raw.includes("BardErrorInfo")) {
    const match = /BardErrorInfo\s*\[(\d+)\]/.exec(raw);
    throw new Error(`Gemini upstream rejected request: BardErrorInfo [${match ? match[1] : "unknown"}]`);
  }
  const texts: string[] = [];
  const lines = raw.split("\n");
  for (const line of lines) {
    if (!line.includes('"wrb.fr"') || line.length < 200) continue;
    try {
      const arr = JSON.parse(line);
      const innerStr = arr[0][2];
      if (!innerStr || innerStr.length < 50) continue;
      const inner = JSON.parse(innerStr);
      if (Array.isArray(inner) && inner.length > 4 && inner[4]) {
        for (const part of inner[4]) {
          if (Array.isArray(part) && part.length > 1 && part[1]) {
            if (Array.isArray(part[1])) {
              for (const t of part[1]) {
                if (typeof t === "string" && t.length > 0) {
                  texts.push(t);
                }
              }
            }
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }
  let text = "";
  for (let i = texts.length - 1; i >= 0; i--) {
    if (texts[i].trim()) {
      text = texts[i];
      break;
    }
  }
  return cleanGeminiText(text);
}

// Helper: Parse responses input into OpenAI messages format
function parseResponsesInput(req: any): Message[] {
  const messages: Message[] = [];
  if (req.instructions) {
    messages.push({ role: "system", content: req.instructions });
  }
  const inputItems = req.input || [];
  if (typeof inputItems === "string") {
    messages.push({ role: "user", content: inputItems });
  } else if (Array.isArray(inputItems)) {
    for (const item of inputItems) {
      if (typeof item === "string") {
        messages.push({ role: "user", content: item });
      } else if (typeof item === "object" && item !== null) {
        if (item.type === "function_call_output") {
          messages.push({
            role: "tool",
            name: item.name || "",
            content: item.output || "",
            tool_call_id: item.call_id || ""
          });
        } else if (item.role === "assistant" || (item.type === "message" && item.role === "assistant")) {
          const cp = item.content;
          let textAcc = "";
          const tcList: any[] = [];
          if (Array.isArray(cp)) {
            for (const c of cp) {
              if (typeof c === "object" && c !== null) {
                if (c.type === "output_text") {
                  textAcc += c.text || "";
                } else if (c.type === "function_call") {
                  tcList.push(c);
                }
              }
            }
          } else if (typeof cp === "string") {
            textAcc = cp;
          }
          const m: Message = { role: "assistant", content: textAcc || "" };
          if (tcList.length > 0) {
            m.tool_calls = tcList.map((tc, idx) => ({
              id: tc.call_id || `call_${idx}`,
              type: "function",
              function: {
                name: tc.name || "",
                arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || {})
              }
            }));
          }
          messages.push(m);
        } else {
          const role = item.role || "user";
          let content = item.content || "";
          if (Array.isArray(content)) {
            content = content
              .filter(c => c.type === "text" || c.type === "input_text")
              .map(c => c.text || "")
              .join(" ");
          }
          messages.push({ role, content });
        }
      }
    }
  }
  return messages;
}

// --- API Routes ---

// GET /
app.get('/', (c) => {
  return c.json({
    status: "ok",
    version: "1.1.0",
    models: Object.keys(MODELS)
  });
});

// GET /v1/models
app.get('/v1/models', (c) => {
  return c.json({
    object: "list",
    data: Object.entries(MODELS).map(([n, cfg]) => ({
      id: n,
      object: "model",
      created: 1700000000,
      owned_by: "google",
      description: cfg.desc
    }))
  });
});

// GET /v1beta/models
app.get('/v1beta/models', (c) => {
  const models = Object.entries(MODELS).map(([n, cfg]) => ({
    name: `models/${n}`,
    displayName: n,
    description: cfg.desc,
    supportedGenerationMethods: ["generateContent", "streamGenerateContent"],
  }));
  return c.json({ models });
});

// POST /v1/chat/completions
app.post('/v1/chat/completions', async (c) => {
  const req = await c.req.json();
  const modelRes = resolveModel(req.model);
  if (modelRes.error) {
    return c.json({ error: { message: modelRes.error } }, 400);
  }
  const { modelName, mode: modelId, think: thinkMode } = modelRes;
  const tools = req.tools;
  let prompt = messagesToPrompt(req.messages || [], tools);
  if (!prompt.trim()) {
    return c.json({ error: { message: "empty prompt" } }, 400);
  }

  const jsonInstruction = buildJsonInstruction(req.response_format);
  const wantJson = jsonInstruction.length > 0;
  if (wantJson) {
    prompt += jsonInstruction;
  }

  const stop = req.stop;
  const maxTokens = req.max_tokens ?? req.max_completion_tokens;
  const includeUsage = !!(req.stream_options && req.stream_options.include_usage);
  const promptTokens = countTokens(prompt);
  const usageObj = (completion: string) => {
    const ct = countTokens(completion);
    return { prompt_tokens: promptTokens, completion_tokens: ct, total_tokens: promptTokens + ct };
  };

  const stream = req.stream === true;
  const cid = `chatcmpl-${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;

  const payload = buildGeminiPayload(prompt, modelId, thinkMode);
  const url = buildUpstreamUrl(c.env);
  const headers = await getUpstreamHeaders(c.env);

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: payload
  });

  if (!response.ok) {
    return c.json({ error: { message: `upstream error: ${response.statusText}` } }, 502);
  }

  // True streaming: forward chunks as they arrive (only if tools are not used, tools need full text parses)
  if (stream && !tools && !wantJson) {
    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');
    const reader = response.body?.getReader();
    if (!reader) {
      return c.json({ error: { message: "No response body from upstream" } }, 502);
    }
    const decoder = new TextDecoder();

    return streamText(c, async (honoStream) => {
      honoStream.onAbort(() => {
        reader.cancel();
      });

      try {
        let buffer = "";
        let prevText = "";
        let emitted = "";
        let finishReason = "stop";
        let stopEmit = false;
        const stops: string[] = stop ? (Array.isArray(stop) ? stop : [stop]) : [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          if (buffer.includes("BardErrorInfo")) {
            const match = /BardErrorInfo\s*\[(\d+)\]/.exec(buffer);
            throw new Error(`Gemini upstream rejected request: BardErrorInfo [${match ? match[1] : "unknown"}]`);
          }
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.includes('"wrb.fr"') || line.length < 200) continue;
            try {
              const arr = JSON.parse(line);
              const innerStr = arr[0][2];
              if (!innerStr || innerStr.length < 50) continue;
              const inner2 = JSON.parse(innerStr);
              if (Array.isArray(inner2) && inner2.length > 4 && inner2[4]) {
                for (const part of inner2[4]) {
                  if (Array.isArray(part) && part.length > 1 && part[1] && Array.isArray(part[1])) {
                    for (const t of part[1]) {
                      if (typeof t === "string" && t.length > prevText.length) {
                        const delta = t.substring(prevText.length);
                        prevText = t;
                        let piece = cleanGeminiText(delta);
                        if (!piece) continue;
                        // stop sequences (may straddle the delta boundary)
                        if (stops.length) {
                          const combined = emitted + piece;
                          let cut = -1;
                          for (const s of stops) {
                            if (!s) continue;
                            const i = combined.indexOf(s, Math.max(0, emitted.length - s.length));
                            if (i !== -1 && (cut === -1 || i < cut)) cut = i;
                          }
                          if (cut !== -1) {
                            piece = cut >= emitted.length ? combined.substring(emitted.length, cut) : "";
                            finishReason = "stop";
                            stopEmit = true;
                          }
                        }
                        // max_tokens
                        if (maxTokens != null && countTokens(emitted + piece) > maxTokens) {
                          const allowed = maxTokens - countTokens(emitted);
                          piece = allowed > 0 ? trimToTokens(piece, allowed) : "";
                          finishReason = "length";
                          stopEmit = true;
                        }
                        if (piece) {
                          const chunk = {
                            id: cid,
                            object: "chat.completion.chunk",
                            created: Math.floor(Date.now() / 1000),
                            model: modelName,
                            choices: [{
                              index: 0,
                              delta: { content: piece },
                              finish_reason: null
                            }]
                          };
                          await honoStream.write(`data: ${JSON.stringify(chunk)}\n\n`);
                          emitted += piece;
                        }
                        if (stopEmit) break;
                      }
                    }
                  }
                  if (stopEmit) break;
                }
              }
            } catch (e) {
              // ignore
            }
            if (stopEmit) break;
          }
          if (stopEmit) break;
        }

        // Final Stop Chunk
        const stopChunk = {
          id: cid,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: modelName,
          choices: [{
            index: 0,
            delta: {},
            finish_reason: finishReason
          }]
        };
        await honoStream.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
        if (includeUsage) {
          const usageChunk = {
            id: cid,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: modelName,
            choices: [],
            usage: usageObj(emitted)
          };
          await honoStream.write(`data: ${JSON.stringify(usageChunk)}\n\n`);
        }
        await honoStream.write("data: [DONE]\n\n");
      } catch (err: any) {
        const errChunk = {
          id: cid,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: modelName,
          choices: [{
            index: 0,
            delta: { content: `\n[Upstream Error: ${err.message}]` },
            finish_reason: "error"
          }]
        };
        await honoStream.write(`data: ${JSON.stringify(errChunk)}\n\n`);
        await honoStream.write("data: [DONE]\n\n");
      }
    });
  }

  // Non-streaming completion (or stream with tools)
  try {
    const raw = await response.text();
    const text = extractResponseText(raw);
    let cleanText = text;
    let toolCalls = null;
    if (tools && text) {
      const parsed = parseToolCalls(text);
      cleanText = parsed.cleanText;
      toolCalls = parsed.toolCalls;
    }
    if (wantJson && !toolCalls && cleanText) {
      cleanText = extractJson(cleanText);
    }

    let finish = toolCalls ? "tool_calls" : "stop";
    if (!toolCalls) {
      const capped = applyStopAndMax(cleanText, stop, maxTokens);
      cleanText = capped.text;
      finish = capped.finish;
    }

    const msg: any = { role: "assistant", content: cleanText || null };
    if (toolCalls) {
      msg.tool_calls = toolCalls;
    }

    if (stream) {
      // Tools stream: return a single event stream block
      c.header('Content-Type', 'text/event-stream');
      c.header('Cache-Control', 'no-cache');
      c.header('Connection', 'keep-alive');
      return streamText(c, async (honoStream) => {
        const chunk = {
          id: cid,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: modelName,
          choices: [{ index: 0, delta: msg, finish_reason: finish }]
        };
        await honoStream.write(`data: ${JSON.stringify(chunk)}\n\n`);
        if (includeUsage) {
          const usageChunk = {
            id: cid,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: modelName,
            choices: [],
            usage: usageObj(cleanText || "")
          };
          await honoStream.write(`data: ${JSON.stringify(usageChunk)}\n\n`);
        }
        await honoStream.write("data: [DONE]\n\n");
      });
    }

    return c.json({
      id: cid,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: modelName,
      choices: [{ index: 0, message: msg, finish_reason: finish }],
      usage: usageObj(cleanText || "")
    });
  } catch (err: any) {
    return c.json({ error: { message: `upstream error: ${err.message}` } }, 502);
  }
});

// POST /v1/responses
app.post('/v1/responses', async (c) => {
  const req = await c.req.json();
  const modelRes = resolveModel(req.model);
  if (modelRes.error) {
    return c.json({ error: { message: modelRes.error } }, 400);
  }
  const { modelName, mode: modelId, think: thinkMode } = modelRes;
  const messages = parseResponsesInput(req);
  let tools = req.tools;
  if (Array.isArray(tools)) {
    tools = tools.map(t => {
      if (t.type === "function" && !t.function) {
        return {
          type: "function",
          function: {
            name: t.name,
            description: t.description || "",
            parameters: t.parameters || {}
          }
        };
      }
      return t;
    });
  }
  const prompt = messagesToPrompt(messages, tools);
  if (!prompt.trim()) {
    return c.json({ error: { message: "empty input" } }, 400);
  }

  const payload = buildGeminiPayload(prompt, modelId, thinkMode);
  const url = buildUpstreamUrl(c.env);
  const headers = await getUpstreamHeaders(c.env);

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: payload
  });

  if (!response.ok) {
    return c.json({ error: { message: `upstream error: ${response.statusText}` } }, 502);
  }

  const rid = `resp_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;
  const mid = `msg_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;

  if (req.stream === true) {
    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');
    const reader = response.body?.getReader();
    if (!reader) {
      return c.json({ error: { message: "No response body from upstream" } }, 502);
    }
    const decoder = new TextDecoder();

    return streamText(c, async (honoStream) => {
      honoStream.onAbort(() => {
        reader.cancel();
      });

      try {
        let raw = "";
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          raw += buffer;
        }

        const text = extractResponseText(raw);
        const { cleanText, toolCalls } = parseToolCalls(text);
        const output: any[] = [];
        if (toolCalls) {
          for (const tc of toolCalls) {
            output.push({
              type: "function_call",
              id: tc.id,
              call_id: tc.id,
              name: tc.function.name,
              arguments: tc.function.arguments,
              status: "completed"
            });
          }
        }
        if (cleanText || !toolCalls) {
          output.push({
            type: "message",
            id: mid,
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text: cleanText || "", annotations: [] }]
          });
        }

        const evCreated = {
          type: "response.created",
          response: { id: rid, object: "response", status: "in_progress", model: modelName, output: [] }
        };
        await honoStream.write(`event: response.created\ndata: ${JSON.stringify(evCreated)}\n\n`);

        for (const item of output) {
          if (item.type === "function_call") {
            const ev = {
              type: "response.function_call_arguments.done",
              item_id: item.id,
              call_id: item.call_id,
              name: item.name,
              arguments: item.arguments
            };
            await honoStream.write(`event: response.function_call_arguments.done\ndata: ${JSON.stringify(ev)}\n\n`);
          } else if (item.type === "message") {
            for (let ci = 0; ci < item.content.length; ci++) {
              const cp = item.content[ci];
              const ev = {
                type: "response.output_text.done",
                item_id: item.id,
                content_index: ci,
                text: cp.text
              };
              await honoStream.write(`event: response.output_text.done\ndata: ${JSON.stringify(ev)}\n\n`);
            }
          }
        }

        const respObj = {
          id: rid,
          object: "response",
          status: "completed",
          model: modelName,
          output,
          usage: {
            input_tokens: Math.floor(prompt.length / 4),
            output_tokens: Math.floor(text.length / 4),
            total_tokens: Math.floor((prompt.length + text.length) / 4)
          }
        };
        await honoStream.write(`event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response: respObj })}\n\n`);
      } catch (err: any) {
        await honoStream.write(`event: error\ndata: ${JSON.stringify({ error: { message: err.message } })}\n\n`);
      }
    });
  } else {
    try {
      const raw = await response.text();
      const text = extractResponseText(raw);
      const { cleanText, toolCalls } = parseToolCalls(text);
      const output: any[] = [];
      if (toolCalls) {
        for (const tc of toolCalls) {
          output.push({
            type: "function_call",
            id: tc.id,
            call_id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
            status: "completed"
          });
        }
      }
      if (cleanText || !toolCalls) {
        output.push({
          type: "message",
          id: mid,
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: cleanText || "", annotations: [] }]
        });
      }

      return c.json({
        id: rid,
        object: "response",
        created_at: Math.floor(Date.now() / 1000),
        status: "completed",
        model: modelName,
        output,
        usage: {
          input_tokens: Math.floor(prompt.length / 4),
          output_tokens: Math.floor(text.length / 4),
          total_tokens: Math.floor((prompt.length + text.length) / 4)
        }
      });
    } catch (err: any) {
      return c.json({ error: { message: err.message } }, 502);
    }
  }
});

// Google native endpoints mapping
app.post('/v1beta/models/:modelAndMethod', async (c) => {
  const modelAndMethod = c.req.param("modelAndMethod");
  let isStream = false;
  let rawModelName = "";

  if (modelAndMethod.endsWith(":streamGenerateContent")) {
    isStream = true;
    rawModelName = modelAndMethod.replace(":streamGenerateContent", "");
  } else if (modelAndMethod.endsWith(":generateContent")) {
    isStream = false;
    rawModelName = modelAndMethod.replace(":generateContent", "");
  } else {
    return c.json({ error: { message: "Invalid method in path" } }, 404);
  }

  // Support path parameter format e.g. models/gemini-3.5-flash:generateContent
  // In hono routes, if :modelAndMethod matches models/..., param comes as models/gemini-3.5-flash
  // But wait! If route is /v1beta/models/:modelAndMethod, and request is /v1beta/models/gemini-3.5-flash:generateContent,
  // then param modelAndMethod is indeed "gemini-3.5-flash:generateContent".
  // If it was /v1beta/models/models/gemini-3.5-flash:generateContent, modelAndMethod might not match cleanly.
  // Let's make sure we clean up any "models/" prefix.
  if (rawModelName.startsWith("models/")) {
    rawModelName = rawModelName.substring(7);
  }

  const modelRes = resolveModel(rawModelName);
  if (modelRes.error) {
    return c.json({ error: { message: modelRes.error } }, 400);
  }
  const { modelName, mode: modelId, think: thinkMode } = modelRes;

  const req = await c.req.json();
  let prompt = googleContentsToPrompt(req);
  if (!prompt.trim()) {
    return c.json({ error: { message: "empty content" } }, 400);
  }

  const genConfig = req.generationConfig || {};
  const wantJson = genConfig.responseMimeType === "application/json";
  if (wantJson) {
    const schema = genConfig.responseSchema;
    const rf = schema ? { type: "json_schema", json_schema: { schema } } : { type: "json_object" };
    prompt += buildJsonInstruction(rf);
  }

  const payload = buildGeminiPayload(prompt, modelId, thinkMode);
  const url = buildUpstreamUrl(c.env);
  const headers = await getUpstreamHeaders(c.env);

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: payload
  });

  if (!response.ok) {
    return c.json({ error: { message: `upstream error: ${response.statusText}` } }, 502);
  }

  try {
    const raw = await response.text();
    const rawText = extractResponseText(raw);
    const text = wantJson ? extractJson(rawText) : rawText;

    const candidate = {
      content: { parts: [{ text: text || "" }], role: "model" },
      finishReason: "STOP",
      index: 0,
    };
    const usage = {
      promptTokenCount: Math.floor(prompt.length / 4),
      candidatesTokenCount: Math.floor(text.length / 4),
      totalTokenCount: Math.floor((prompt.length + text.length) / 4),
    };
    const responseObj = {
      candidates: [candidate],
      usageMetadata: usage,
      modelVersion: modelName,
    };

    if (isStream) {
      c.header('Content-Type', 'text/event-stream');
      c.header('Cache-Control', 'no-cache');
      c.header('Connection', 'keep-alive');
      return streamText(c, async (honoStream) => {
        await honoStream.write(`data: ${JSON.stringify(responseObj)}\n\n`);
      });
    }

    return c.json(responseObj);
  } catch (err: any) {
    return c.json({ error: { message: err.message } }, 502);
  }
});

export default app;
