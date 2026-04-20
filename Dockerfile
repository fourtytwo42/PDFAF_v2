FROM ghcr.io/ggml-org/llama.cpp:server AS llama_runtime

FROM node:22-trixie-slim

ARG HF_REPO=unsloth/gemma-4-E2B-it-GGUF
ARG GGUF_FILE=gemma-4-E2B-it-Q4_K_M.gguf
ARG MMPROJ_FILE=mmproj-F16.gguf

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    build-essential \
    qpdf \
    python3 \
    python3-pip \
    ghostscript \
    fonts-urw-base35 \
    tesseract-ocr \
    tesseract-ocr-eng \
  && rm -rf /var/lib/apt/lists/*

# pikepdf + fonttools for the helper; ocrmypdf from pip so its pikepdf API matches (avoid apt/py mismatch).
RUN pip3 install --break-system-packages --no-cache-dir pikepdf fonttools 'ocrmypdf>=17.4,<18'

WORKDIR /app

COPY --from=llama_runtime /app /opt/llama

# Download model weights before copying source so Docker layer cache survives code-only rebuilds.
RUN mkdir -p /app/data/llama-work \
  && curl -fL "https://huggingface.co/${HF_REPO}/resolve/main/${GGUF_FILE}" -o "/app/data/llama-work/${GGUF_FILE}" \
  && curl -fL "https://huggingface.co/${HF_REPO}/resolve/main/${MMPROJ_FILE}" -o "/app/data/llama-work/${MMPROJ_FILE}" \
  && test -s "/app/data/llama-work/${GGUF_FILE}" \
  && test -s "/app/data/llama-work/${MMPROJ_FILE}"

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@10 --activate \
  && pnpm install --frozen-lockfile \
  && npm rebuild better-sqlite3 --build-from-source

COPY tsconfig.json ./
COPY src ./src
COPY python ./python

ENV NODE_ENV=production
RUN pnpm build

COPY docker/pdfaf-entrypoint.sh /usr/local/bin/pdfaf-entrypoint.sh
RUN chmod +x /usr/local/bin/pdfaf-entrypoint.sh

EXPOSE 6200
ENV PORT=6200
ENV DB_PATH=/data/pdfaf.db
# Large uploads / Python temp: keep off root when TMPDIR points at /data/tmp (see docker-compose).
ENV TMPDIR=/data/tmp
ENV LLAMA_SERVER_BIN=/opt/llama/llama-server
ENV LD_LIBRARY_PATH=/opt/llama
ENV PDFAF_RUN_LOCAL_LLM=1
ENV PDFAF_LLAMA_WORKDIR=/app/data/llama-work
ENV PDFAF_REMEDIATE_DEFAULT_SEMANTIC=1
ENV PDFAF_REMEDIATE_DEFAULT_SEMANTIC_HEADINGS=1

ENTRYPOINT ["/usr/local/bin/pdfaf-entrypoint.sh"]
CMD ["node", "dist/server.js"]
