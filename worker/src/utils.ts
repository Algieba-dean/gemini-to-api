/**
 * SHA-1 Hash generator using Web Crypto API.
 */
export async function sha1(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-1", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * SAPISIDHASH generator for session authentication headers.
 */
export async function makeSapisidHash(sapisid: string): Promise<string> {
  const ts = Math.floor(Date.now() / 1000);
  const hash = await sha1(`${ts} ${sapisid} https://gemini.google.com`);
  return `SAPISIDHASH ${ts}_${hash}`;
}

export interface Message {
  role: string;
  content: string | Array<{ type: string; text?: string; [key: string]: any }>;
  tool_calls?: any[];
  name?: string;
  [key: string]: any;
}

/**
 * Convert OpenAI messages to a single prompt string.
 */
export function messagesToPrompt(messages: Message[], tools?: any[]): string {
  const parts: string[] = [];
  if (tools && tools.length > 0) {
    const toolDefs = tools.map(tool => {
      const fn = tool.type === "function" ? tool.function : tool;
      return {
        name: fn.name || "",
        description: fn.description || "",
        parameters: fn.parameters || {},
      };
    });
    if (toolDefs.length > 0) {
      parts.push(
        "[System instruction]: You have access to tools. " +
        "To call a tool, respond with:\n" +
        '```tool_call\n{"name": "func_name", "arguments": {...}}\n```\n' +
        "Only use tool_call blocks when needed.\n\n" +
        `Available tools:\n${JSON.stringify(toolDefs, null, 2)}`
      );
    }
  }
  for (const msg of messages) {
    const role = msg.role || "user";
    let content = msg.content || "";
    if (Array.isArray(content)) {
      content = content
        .filter(c => c.type === "text" || c.type === "input_text")
        .map(c => c.text || "")
        .join(" ");
    }
    if (role === "system") {
      parts.push(`[System instruction]: ${content}`);
    } else if (role === "assistant") {
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        const tcStrs = msg.tool_calls.map(tc => {
          const fn = tc.function || {};
          return `\`\`\`tool_call\n${JSON.stringify({ name: fn.name, arguments: typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : (fn.arguments || {}) })}\n\`\`\``;
        });
        parts.push(`[Assistant]: ${content || ""}\n${tcStrs.join("\n")}`);
      } else {
        parts.push(`[Assistant]: ${content}`);
      }
    } else if (role === "tool") {
      parts.push(`[Tool result for ${msg.name || ""}]: ${content}`);
    } else {
      parts.push(content ? String(content) : "");
    }
  }
  return parts.filter(p => p.trim()).join("\n\n");
}

/**
 * Convert Google API contents format to prompt string.
 */
export function googleContentsToPrompt(req: any): string {
  const parts: string[] = [];
  const sysInst = req.systemInstruction;
  if (sysInst) {
    const sysParts = sysInst.parts || [];
    const sysText = sysParts
      .filter((p: any) => p.text)
      .map((p: any) => p.text)
      .join(" ");
    if (sysText) {
      parts.push(`[System instruction]: ${sysText}`);
    }
  }
  const contents = req.contents || [];
  for (const content of contents) {
    const role = content.role || "user";
    const textParts: string[] = [];
    for (const p of content.parts || []) {
      if (p.text) {
        textParts.push(p.text);
      }
    }
    const text = textParts.join(" ");
    if (role === "model") {
      parts.push(`[Assistant]: ${text}`);
    } else {
      parts.push(text);
    }
  }
  return parts.filter(p => p.trim()).join("\n\n");
}

/**
 * Extract tool_call blocks from response text.
 */
export function parseToolCalls(text: string): { cleanText: string; toolCalls: any[] | null } {
  const toolCalls: any[] = [];
  const pattern = /```tool_call\s*\n([\s\S]*?)\n```/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      const id = `call_${Math.random().toString(36).substring(2, 10)}`;
      toolCalls.push({
        id,
        type: "function",
        function: {
          name: data.name,
          arguments: typeof data.arguments === 'string' ? data.arguments : JSON.stringify(data.arguments || {}),
        },
      });
    } catch (e) {
      // ignore malformed tool_call
    }
  }
  const cleanText = text.replace(pattern, '').trim();
  return {
    cleanText,
    toolCalls: toolCalls.length > 0 ? toolCalls : null,
  };
}

/**
 * Remove internal code execution artifacts.
 */
export function cleanGeminiText(text: string): string {
  const pattern = /```(?:python|javascript|text)\?code_(?:reference|stdout)&code_event_index=\d+\n[\s\S]*?```\n?/g;
  return text.replace(pattern, '').trim();
}
