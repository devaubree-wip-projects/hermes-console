/**
 * Mock Hermes proxy — OpenAI-compatible /v1/chat/completions with SSE streaming.
 * Dev fixture only: lets the console be exercised end-to-end offline, without a
 * running `hermes proxy start` (which needs Nous/xAI OAuth). Run: bun run mock:hermes
 */

const PORT = Number(process.env.MOCK_HERMES_PORT ?? 8645);

function sseChunk(content: string): string {
  return `data: ${JSON.stringify({
    id: "chatcmpl-mock",
    object: "chat.completion.chunk",
    model: "hermes-mock",
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  })}\n\n`;
}

function buildReply(messages: { role: string; content: string }[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const excerpt = (lastUser?.content ?? "").slice(0, 160);
  return [
    `Bien reçu. Voici ma réponse (mock Hermes) à votre demande : « ${excerpt} ».`,
    "",
    "1. J'ai analysé le contexte du workspace (permissions, connaissances, fichiers).",
    "2. Voici une proposition structurée que vous pouvez relire et valider.",
    "3. Dites-moi si vous souhaitez que j'approfondisse un point.",
    "",
    "— Réponse générée par le mock local, branchez un vrai gateway Hermes pour des réponses réelles.",
  ].join("\n");
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/v1/models") {
      return Response.json({ object: "list", data: [{ id: "hermes-mock", object: "model" }] });
    }

    if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
      const body = (await req.json()) as {
        messages?: { role: string; content: string }[];
        stream?: boolean;
      };
      const reply = buildReply(body.messages ?? []);

      if (!body.stream) {
        return Response.json({
          id: "chatcmpl-mock",
          object: "chat.completion",
          model: "hermes-mock",
          choices: [
            { index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" },
          ],
        });
      }

      const words = reply.split(/(?<=\s)/);
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          for (const word of words) {
            controller.enqueue(encoder.encode(sseChunk(word)));
            await new Promise((r) => setTimeout(r, 15));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`Mock Hermes gateway listening on http://localhost:${PORT}/v1`);
