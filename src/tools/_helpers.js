/**
 * Wraps a tool handler so thrown errors become MCP tool errors. The handler
 * may return either a plain string (legacy) or an object shaped like an
 * Upstream result: `{ text, source?, transcriptPath? }`. When transcriptPath
 * is present, append a footer so the user can inspect the spawned session.
 */
export function asTextTool(handler) {
  return async (args) => {
    try {
      const result = await handler(args);
      const text = typeof result === "string" ? result : result.text;
      const transcriptPath = typeof result === "string" ? null : result.transcriptPath;
      const footer = transcriptPath
        ? `\n\n---\n[claude transcript: ${transcriptPath}]`
        : "";
      return { content: [{ type: "text", text: text + footer }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Tool failed: ${e.message}` }],
        isError: true,
      };
    }
  };
}
