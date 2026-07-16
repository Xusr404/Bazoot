# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json
RUN npm ci

FROM deps AS build
COPY client ./client
COPY shared ./shared
RUN npm run build --workspace=@bazoot/client

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=5005 \
    CLIENT_URL=http://localhost:5005 \
    PUBLIC_URL=http://localhost:5005 \
    CLIENT_DIST_DIR=/app/client/dist \
    DATABASE_FILE=/data/bazoot.db \
    QUIZZES_DIR=/data/quizzes \
    ACCOUNTS_FILE=/data/accounts.json \
    SESSIONS_FILE=/data/sessions.json \
    UPLOADS_DIR=/data/uploads

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json
RUN npm ci --omit=dev --workspace=@bazoot/server --workspace=@bazoot/shared --include-workspace-root=false \
  && npm cache clean --force

COPY server ./server
COPY shared ./shared
COPY --from=build /app/client/dist ./client/dist

RUN mkdir -p /data/uploads /data/quizzes \
  && chown -R node:node /app /data

USER node
EXPOSE 5005
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5005) + '/health').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/src/index.js"]
