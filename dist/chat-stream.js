// Decode across byte/chunk boundaries, including split Thai UTF-8 characters.
export async function readChatStream(response, onEvent) {
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === 'error') throw Error(event.error.message);
        if (event.type === 'done') return event.result;
        onEvent(event);
      }
      if (done) throw Error((globalThis.SnaapI18n?.text("การเชื่อมต่อคำตอบขาดระหว่างทาง กรุณาลองใหม่") ?? "การเชื่อมต่อคำตอบขาดระหว่างทาง กรุณาลองใหม่"));
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
