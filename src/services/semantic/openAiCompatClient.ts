import {
  DEFAULT_OPENAI_COMPAT_MODEL,
  getOpenAiCompatApiKey,
  getOpenAiCompatBaseUrl,
  getOpenAiCompatFallbackApiKey,
  getOpenAiCompatFallbackBaseUrl,
  getOpenAiCompatFallbackModel,
  getOpenAiCompatModel,
  SEMANTIC_REQUEST_TIMEOUT_MS,
} from '../../config.js';
import { logInfo, logWarn } from '../../logging.js';

export interface LlmEndpoint {
  baseUrl: string;
  apiKey: string;
  model: string;
  label: 'primary' | 'fallback';
}

export function getLlmEndpoints(): LlmEndpoint[] {
  const out: LlmEndpoint[] = [];
  const primaryUrl = getOpenAiCompatBaseUrl();
  if (primaryUrl) {
    out.push({
      baseUrl: primaryUrl.replace(/\/$/, ''),
      apiKey: getOpenAiCompatApiKey(),
      model: getOpenAiCompatModel() || DEFAULT_OPENAI_COMPAT_MODEL,
      label: 'primary',
    });
  }
  const fbUrl = getOpenAiCompatFallbackBaseUrl();
  if (fbUrl) {
    out.push({
      baseUrl: fbUrl.replace(/\/$/, ''),
      apiKey: getOpenAiCompatFallbackApiKey(),
      model: getOpenAiCompatFallbackModel() || DEFAULT_OPENAI_COMPAT_MODEL,
      label: 'fallback',
    });
  }
  return out;
}

export interface ChatCompletionArgs {
  messages: unknown[];
  tools?: unknown[];
  toolChoice?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
  operation?: string;
  traceId?: string;
}

export interface ToolCallPayload {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * POST /v1/chat/completions. Returns first tool call arguments JSON or throws.
 */
export async function chatCompletionToolCall(
  args: ChatCompletionArgs,
): Promise<{ endpoint: LlmEndpoint; payload: ToolCallPayload }> {
  const endpoints = getLlmEndpoints();
  if (endpoints.length === 0) {
    throw new Error('no_llm_endpoints');
  }

  const timeoutMs = args.timeoutMs ?? SEMANTIC_REQUEST_TIMEOUT_MS;
  let lastErr = 'unknown';

  for (const ep of endpoints) {
    const url = `${ep.baseUrl}/chat/completions`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    if (args.signal) {
      if (args.signal.aborted) {
        clearTimeout(t);
        throw new Error('aborted');
      }
      args.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      logInfo({
        message: 'llm_chat_completion_start',
        details: {
          operation: args.operation ?? 'semantic_unknown',
          traceId: args.traceId,
          endpoint: ep.label,
          model: ep.model,
          url,
          hasTools: Boolean(args.tools?.length),
          timeoutMs,
          messageCount: args.messages.length,
        },
      });

      const body: Record<string, unknown> = {
        model: ep.model,
        messages: args.messages,
        temperature: 0.2,
      };
      if (args.tools?.length) {
        body['tools'] = args.tools;
        body['tool_choice'] = args.toolChoice ?? 'auto';
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ep.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(t);

      if (!res.ok) {
        lastErr = `http_${res.status}`;
        logWarn({
          message: 'llm_chat_completion_http_error',
          details: {
            operation: args.operation ?? 'semantic_unknown',
            traceId: args.traceId,
            endpoint: ep.label,
            model: ep.model,
            url,
            status: res.status,
          },
        });
        continue;
      }

      const json = (await res.json()) as {
        choices?: Array<{
          message?: {
            tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
            content?: string | null;
          };
        }>;
      };

      const toolCalls = json.choices?.[0]?.message?.tool_calls;
      if (toolCalls?.length) {
        const fn = toolCalls[0]!.function;
        if (fn?.name && fn.arguments) {
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(fn.arguments) as Record<string, unknown>;
          } catch {
            lastErr = 'bad_tool_json';
            logWarn({
              message: 'llm_chat_completion_bad_tool_json',
              details: {
                operation: args.operation ?? 'semantic_unknown',
                traceId: args.traceId,
                endpoint: ep.label,
                model: ep.model,
                toolName: fn.name,
              },
            });
            continue;
          }
          logInfo({
            message: 'llm_chat_completion_success',
            details: {
              operation: args.operation ?? 'semantic_unknown',
              traceId: args.traceId,
              endpoint: ep.label,
              model: ep.model,
              responseType: 'tool_call',
              toolName: fn.name,
            },
          });
          return { endpoint: ep, payload: { name: fn.name, arguments: parsed } };
        }
      }

      const content = json.choices?.[0]?.message?.content;
      if (typeof content === 'string' && content.trim()) {
        try {
          const parsed = JSON.parse(content) as Record<string, unknown>;
          logInfo({
            message: 'llm_chat_completion_success',
            details: {
              operation: args.operation ?? 'semantic_unknown',
              traceId: args.traceId,
              endpoint: ep.label,
              model: ep.model,
              responseType: 'inline_json',
            },
          });
          return { endpoint: ep, payload: { name: 'inline_json', arguments: parsed } };
        } catch {
          lastErr = 'no_tool_calls';
          logWarn({
            message: 'llm_chat_completion_unparseable_content',
            details: {
              operation: args.operation ?? 'semantic_unknown',
              traceId: args.traceId,
              endpoint: ep.label,
              model: ep.model,
            },
          });
          continue;
        }
      }

      lastErr = 'no_tool_calls';
      logWarn({
        message: 'llm_chat_completion_no_tool_calls',
        details: {
          operation: args.operation ?? 'semantic_unknown',
          traceId: args.traceId,
          endpoint: ep.label,
          model: ep.model,
        },
      });
    } catch (e) {
      clearTimeout(t);
      lastErr = (e as Error).name === 'AbortError' ? 'timeout' : (e as Error).message;
      logWarn({
        message: 'llm_chat_completion_exception',
        details: {
          operation: args.operation ?? 'semantic_unknown',
          traceId: args.traceId,
          endpoint: ep.label,
          model: ep.model,
          error: lastErr,
        },
      });
    }
  }

  throw new Error(`chat_completion_failed:${lastErr}`);
}
