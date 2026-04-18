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
      version: '8d78a7b',
      filename: 'gemma-4-E2B-it-Q4_K_M.gguf',
      url: 'https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf?download=1',
      sha256: 'ac0069ebccd39925d836f24a88c0f0c858d20578c29b21ab7cedce66ee576845',
      size: 3106735776,
    },
    mmproj: {
      id: 'mmproj',
      version: 'ad46cc8',
      filename: 'mmproj-F16.gguf',
      url: 'https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/mmproj-F16.gguf?download=1',
      sha256: '36510d06fc72d72c995f323174092dc14555d843e3bbb8817ee2b98380e1c7b7',
      size: 985654208,
    },
  },
};
