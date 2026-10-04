import OpenAI from 'openai';
import type { Response as AIResponse, ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
import { setTimeout as delay } from 'node:timers/promises';

// Never persist provider messages/raw bodies: they may echo prompts or credentials.
const safeCode = (value: unknown) => typeof value === 'string' && /^[\w.:-]{1,120}$/.test(value) ? value : null;
export class ProviderFailure extends Error {
  constructor(public status: number | null, public providerCode: string | null,
    public requestId: string | null, public param: string | null = null, public retryable = true) {
    super('AI provider request failed');
    this.name = 'ProviderFailure';
  }
}
export function providerFailureDetails(error: unknown) {
  if (error instanceof ProviderFailure) return { kind: error.name, status: error.status,
    providerCode: error.providerCode, requestId: error.requestId, param: error.param };
  if (error instanceof OpenAI.APIError) return { kind: safeCode(error.name), status: error.status ?? null,
    providerCode: safeCode(error.code), requestId: safeCode(error.requestID), param: safeCode(error.param) };
  return { kind: error instanceof Error ? safeCode(error.name) : 'UnknownError', status: null };
}
export async function createProviderResponse(client: OpenAI, body: ResponseCreateParamsNonStreaming,
  signal: AbortSignal, trace: unknown[]): Promise<AIResponse> {
  for (let attempt = 0; ; attempt++) {
    try {
      // responses.create transforms output before the caller can inspect an HTTP 200 error.
      const { data, response } = await client.post<any>('/responses', { body, signal }).withResponse();
      const requestId = safeCode(response.headers.get('x-request-id')) ?? safeCode(data?.id);
      if (data?.error) {
        const code = data.error.code;
        const numericCode = Number(code);
        const status = Number.isInteger(numericCode) && numericCode >= 400 && numericCode <= 599 ? numericCode : ({ rate_limit_exceeded: 429,
          server_error: 503, internal_error: 503 } as Record<string, number>)[code ?? data.error.type] ?? null;
        const inputTokens = data.usage?.input_tokens ?? 0, outputTokens = data.usage?.output_tokens ?? 0;
        if (inputTokens || outputTokens) trace.push({ inputTokens, outputTokens });
        // Do not duplicate a charged or partially generated response with another request.
        throw new ProviderFailure(status, safeCode(String(code ?? data.error.type ?? 'PROVIDER_ERROR')), requestId,
          safeCode(data.error.param), !(inputTokens || outputTokens || data.output?.length));
      }
      if (!data || !Array.isArray(data.output) || typeof data.status !== 'string' ||
        data.output.some((item: any) => !item || typeof item.type !== 'string' ||
          (item.type === 'message' && !Array.isArray(item.content))))
        throw new ProviderFailure(null, 'MALFORMED_RESPONSE', requestId);
      data.output_text = data.output.filter((item: any) => item.type === 'message')
        .flatMap((item: any) => item.content).filter((item: any) => item?.type === 'output_text' && typeof item.text === 'string')
        .map((item: any) => item.text).join('');
      return data as AIResponse;
    } catch (error) {
      const details = providerFailureDetails(error);
      trace.push({ providerAttempt: attempt + 1, failure: details });
      // No retries for request incompatibility, incomplete output or ambiguous timeouts.
      // A single retry remains under the shared deadline and creates no extra user/run rows.
      if (attempt > 0 || signal.aborted || (error instanceof ProviderFailure && !error.retryable) ||
        ![429, 502, 503, 504].includes(details.status ?? 0)) throw error;
      await delay(500, undefined, { signal });
    }
  }
}
