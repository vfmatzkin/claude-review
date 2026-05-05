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
      const content = [{ type: "text", text }];
      if (transcriptPath) {
        process.stderr.write(`[claude-review-mcp] transcript: ${transcriptPath}\n`);
        content.push({
          type: "text",
          text:
            `\n\n---\n` +
            `**MANDATORY — show this line to the user verbatim, do not summarize or omit:**\n` +
            `Transcript: \`${transcriptPath}\` — read it with the \`inspect_transcript\` tool from this MCP.`,
        });
      }
      return { content };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Tool failed: ${e.message}` }],
        isError: true,
      };
    }
  };
}
