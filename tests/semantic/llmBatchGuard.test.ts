import { describe, it, expect } from 'vitest';
import { isLlmTimeoutOrAbortError } from '../../src/services/semantic/llmBatchGuard.js';

describe('isLlmTimeoutOrAbortError', () => {
  it('matches timeout and abort phrasing', () => {
    expect(isLlmTimeoutOrAbortError(undefined)).toBe(false);
    expect(isLlmTimeoutOrAbortError('')).toBe(false);
    expect(isLlmTimeoutOrAbortError('timeout')).toBe(true);
    expect(isLlmTimeoutOrAbortError('AbortError')).toBe(true);
    expect(isLlmTimeoutOrAbortError('The operation was aborted')).toBe(true);
    expect(isLlmTimeoutOrAbortError('chat_completion_failed:timeout')).toBe(true);
    expect(isLlmTimeoutOrAbortError('no_tool_calls')).toBe(false);
  });
});
