# llama.cpp server with Gemma 4 E2B Q4 baked in (~4 GiB layer). Weights download at `docker build`, not on first `docker compose up`.
# Override build-args to pin another public file from the same Hugging Face `resolve/main/<file>` layout.
FROM ghcr.io/ggml-org/llama.cpp:server

USER root

ARG HF_REPO=unsloth/gemma-4-E2B-it-GGUF
ARG GGUF_FILE=gemma-4-E2B-it-Q4_K_M.gguf
ARG MMPROJ_FILE=mmproj-F16.gguf

# Base image usually includes curl; install if missing (some tags are minimal).
RUN set -eux; \
  if ! command -v curl >/dev/null 2>&1; then \
    apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*; \
  fi

RUN mkdir -p /models \
  && curl -fL "https://huggingface.co/${HF_REPO}/resolve/main/${GGUF_FILE}" -o "/models/${GGUF_FILE}" \
  && curl -fL "https://huggingface.co/${HF_REPO}/resolve/main/${MMPROJ_FILE}" -o "/models/${MMPROJ_FILE}" \
  && test -s "/models/${GGUF_FILE}" \
  && test -s "/models/${MMPROJ_FILE}" \
  && ln -sf "/models/${GGUF_FILE}" /models/llama-default.gguf \
  && ln -sf "/models/${MMPROJ_FILE}" /models/llama-default-mmproj.gguf \
  && ls -lh /models/
