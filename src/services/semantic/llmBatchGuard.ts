/**
 * Detect transport/timeout failures from batched LLM calls (fail-closed policy).
 */
export function isLlmTimeoutOrAbortError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes('timeout') ||
    m.includes('abort') ||
    m.includes('aborted') ||
    m.includes('chat_completion_failed:timeout')
  );
}
