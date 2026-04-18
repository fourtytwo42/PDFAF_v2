export interface LocalLlmArtifactManifestEntry {
  id: 'llama-server' | 'gguf' | 'mmproj';
  version: string;
  filename: string;
  url: string;
  sha256: string;
  size: number;
}

export interface LocalLlmArtifactManifest {
  profileId: string;
  hfRepo: string;
  generatedFor: 'windows-x64';
  artifacts: {
    llamaServer: LocalLlmArtifactManifestEntry;
    gguf: LocalLlmArtifactManifestEntry;
    mmproj: LocalLlmArtifactManifestEntry;
  };
}

export const localLlmArtifactManifest: LocalLlmArtifactManifest = {
  profileId: 'gemma-4-e2b-it-q4-k-m',
  hfRepo: 'unsloth/gemma-4-E2B-it-GGUF',
  generatedFor: 'windows-x64',
  artifacts: {
    llamaServer: {
      id: 'llama-server',
      version: 'b8797',
      filename: 'llama-b8797-bin-win-cpu-x64.zip',
      url: 'https://github.com/ggml-org/llama.cpp/releases/download/b8797/llama-b8797-bin-win-cpu-x64.zip',
      sha256: '38ac31b3e82e96debc3accef59a768bee671611defe427c59bd925a441069438',
      size: 40072757,
    },
    gguf: {
      id: 'gguf',
      version: 'f064409f340b34190993560b2168133e5dbae558',
      filename: 'gemma-4-E2B-it-Q4_K_M.gguf',
      url: 'https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf?download=1',
      sha256: '87708dca555d3a6db8679f16940bfaad74c1be2bbc7d3aa0d1e4cdc7aef2c048',
      size: 3106735776,
    },
    mmproj: {
      id: 'mmproj',
      version: 'f064409f340b34190993560b2168133e5dbae558',
      filename: 'mmproj-F16.gguf',
      url: 'https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/mmproj-F16.gguf?download=1',
      sha256: '403b721dff2f78838e85fc6237d329f05289b6c167061923c85fccba389f81f3',
      size: 985654208,
    },
  },
};
