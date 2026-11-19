/**
 * A tiny Server-Sent Events parser, because the bell's stream must send the normal `Authorization: Bearer` header and the
 * browser's `EventSource` cannot. Feed it each decoded chunk of the response body; it calls `onEvent` once per complete
 * event (events end with a blank line; a chunk may hold several events, or half of one). Comment lines (`: ...`) are ignored.
 */
export interface SseEvent {
  /** The `event:` field; `message` when the server sent none. */
  name: string;
  data: string;
}

export function createSseParser(onEvent: (event: SseEvent) => void): (chunk: string) => void {
  let buffer = "";
  return (chunk: string) => {
    buffer += chunk;
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      let name = "message";
      const data: string[] = [];
      for (const line of block.split(/\r?\n/)) {
        if (line === "" || line.startsWith(":")) continue;
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        if (field === "event") name = value;
        else if (field === "data") data.push(value);
      }
      if (data.length > 0 || name !== "message") onEvent({ name, data: data.join("\n") });
    }
  };
}
