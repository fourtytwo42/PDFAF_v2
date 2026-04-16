FROM node:22-bookworm-slim

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

ENTRYPOINT ["/usr/local/bin/pdfaf-entrypoint.sh"]
CMD ["node", "dist/server.js"]
