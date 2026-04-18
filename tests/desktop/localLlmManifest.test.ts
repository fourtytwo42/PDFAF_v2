import { describe, expect, it } from 'vitest';
import { localLlmArtifactManifest } from '../../apps/desktop/src/localLlmManifest.js';

describe('desktop local LLM artifact manifest', () => {
  it('defines the required artifact metadata for Windows installer builds', () => {
    expect(localLlmArtifactManifest.generatedFor).toBe('windows-x64');
    expect(localLlmArtifactManifest.hfRepo).toBe('unsloth/gemma-4-E2B-it-GGUF');

    for (const artifact of Object.values(localLlmArtifactManifest.artifacts)) {
      expect(artifact.url.length).toBeGreaterThan(0);
      expect(artifact.filename.length).toBeGreaterThan(0);
      expect(artifact.size).toBeGreaterThan(0);
      expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
