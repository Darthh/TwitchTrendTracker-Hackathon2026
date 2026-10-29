FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 CODEX_LIVE=false
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/data /app/analyst/db && chown -R node:node /app/data /app/analyst
USER node
EXPOSE 3000
VOLUME ["/app/data", "/app/analyst/db"]
CMD ["npm", "start"]
