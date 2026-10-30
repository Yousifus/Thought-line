// Model providers: an OpenAI-compatible chat client, and the routing rule that keeps private pieces on the local model.
import type { Privacy } from './analysis';

export interface CompletionRequest { system: string; user: string; schemaName: string; jsonSchema: object }

export interface ModelProvider {
  readonly name: string;
  readonly kind: 'local' | 'cloud';
  complete(req: CompletionRequest, signal?: AbortSignal): Promise<string>;
}

export interface OpenAICompatibleOptions {
  baseUrl: string;
  model: string;
  kind: 'local' | 'cloud';
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

const DEFAULT_TIMEOUT_MS = 180_000;

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** A client for any server that speaks `POST {baseUrl}/chat/completions` with structured output (LM Studio, llama.cpp, a hosted API). */
export function openAICompatible(opts: OpenAICompatibleOptions): ModelProvider {
  const baseUrl = opts.baseUrl.replace(/\/+$/, '');
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = opts.fetchImpl ?? fetch;

  return {
    name: opts.model,
    kind: opts.kind,
    async complete(req: CompletionRequest, signal?: AbortSignal): Promise<string> {
      const unreachable = (why: string) => new ProviderError(`Model at ${baseUrl} unreachable: ${why}`);
      if (signal?.aborted) throw unreachable('request cancelled');

      // One controller carries both the timeout and the caller's own signal.
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
      const onCallerAbort = () => controller.abort();
      signal?.addEventListener('abort', onCallerAbort, { once: true });

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;
      const body = JSON.stringify({
        model: opts.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: req.schemaName, strict: true, schema: req.jsonSchema },
        },
      });

      try {
        let res: Response;
        try {
          res = await doFetch(`${baseUrl}/chat/completions`, { method: 'POST', headers, body, signal: controller.signal });
        } catch (err) {
          if (timedOut) throw unreachable(`timed out after ${Math.round(timeoutMs / 1000)}s`);
          if (signal?.aborted) throw unreachable('request cancelled');
          throw unreachable(describe(err));
        }
        if (!res.ok) throw new ProviderError(`Model at ${baseUrl} returned ${res.status}`);

        let data: any;
        try {
          data = await res.json();
        } catch (err) {
          if (timedOut) throw unreachable(`timed out after ${Math.round(timeoutMs / 1000)}s`);
          if (signal?.aborted) throw unreachable('request cancelled');
          throw new ProviderError(`Model at ${baseUrl} sent a reply that is not JSON`);
        }
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== 'string') throw new ProviderError(`Model at ${baseUrl} sent a reply with no message content`);
        return content;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onCallerAbort);
      }
    },
  };
}

/**
 * The privacy rule. A private piece only ever gets the local provider; a public piece gets the cloud one if
 * there is one. The local slot must really be local: a cloud-kind provider there is refused, never used.
 */
export function providerFor(
  privacy: Privacy,
  providers: { local: ModelProvider; cloud?: ModelProvider },
): ModelProvider {
  if (privacy === 'public' && providers.cloud) return providers.cloud;
  if (providers.local.kind !== 'local') {
    throw new ProviderError('The local model slot holds a cloud provider; refusing to route through it.');
  }
  return providers.local;
}
