# Viva Agent — one-command HTTP bridge + embed bundles
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY dist ./dist
COPY docs ./docs
COPY examples ./examples
COPY viva.models.json.example ./viva.models.json.example

ENV NODE_ENV=production
ENV VIVA_PORT=8765
ENV VIVA_HOST=0.0.0.0

EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.VIVA_PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "node dist/cli.js serve --port ${VIVA_PORT} --host ${VIVA_HOST}"]
