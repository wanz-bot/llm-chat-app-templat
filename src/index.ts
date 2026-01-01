/**
 * LLM Chat Application (FIXED)
 * - Streaming SSE
 * - Anti <think>
 * - Direct answer only
 */

import { Env, ChatMessage } from "./types";

// ================= MODEL =================
const MODEL_ID = "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b";

// ================= SYSTEM PROMPT =================
const SYSTEM_PROMPT = `
Kamu adalah AI asisten.

ATURAN KERAS (WAJIB):
- JANGAN PERNAH menampilkan <think> atau </think>
- JANGAN menampilkan reasoning, analisa, atau proses berpikir
- JANGAN meta commentary
- JANGAN menjelaskan langkah berpikir

FORMAT JAWABAN:
- Jawaban akhir SAJA
- Langsung ke inti
- Tanpa pembuka
- Tanpa penutup
- Tanpa basa-basi
`;

// ================= HELPER =================
function stripThink(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think>/gi, "")
    .trim();
}

// ================= WORKER =================
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // ================= STATIC ASSETS =================
    if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    // ================= API ROUTE =================
    if (url.pathname === "/api/chat") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      return handleChatRequest(request, env);
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

// ================= CHAT HANDLER =================
async function handleChatRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = (await request.json()) as { messages?: ChatMessage[] };
    const messages: ChatMessage[] = body.messages ?? [];

    // 🔒 PAKSA SYSTEM PROMPT DI PALING DEPAN
    messages.unshift({
      role: "system",
      content: SYSTEM_PROMPT,
    });

    // ================= AI STREAM =================
    const aiStream = await env.AI.run(
      MODEL_ID,
      {
        messages,
        max_tokens: 1024,
        stream: true,
      }
    );

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // ================= FILTER STREAM =================
    const filteredStream = new TransformStream({
      transform(chunk, controller) {
        const text = decoder.decode(chunk, { stream: true });
        const clean = stripThink(text);

        if (clean) {
          controller.enqueue(encoder.encode(clean));
        }
      },
    });

    const readable = aiStream.pipeThrough(filteredStream);

    // ================= RESPONSE =================
    return new Response(readable, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("Chat error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to process request" }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }
}
