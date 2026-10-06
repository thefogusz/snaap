export type ChatStreamEvent = { type: 'start' | 'ping' | 'reset' } | { type: 'delta'; delta: string };
export function readChatStream(response: Response, onEvent: (event: ChatStreamEvent) => void): Promise<{ text: string; draft?: unknown; runId?: string }>;
