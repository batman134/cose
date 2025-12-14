# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache bash curl

COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm ci

COPY src ./src

ENV PORT=3004
ENV NODE_ENV=production
ENV SERVICE_NAME=payment

HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD curl -fsS http://localhost:${PORT}/health || exit 1

CMD ["node", "src/index.js"]
