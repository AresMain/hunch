# HUNCH production image: one Node process serves the client and the game.

# ---- build: install everything, test, build client + server bundle
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Ad slots stay hidden in production until a network is wired (`--build-arg VITE_ADS=live`).
ARG VITE_ADS=off
ENV VITE_ADS=$VITE_ADS
RUN npm run typecheck && npm test && npm run build

# ---- runtime: production dependencies only
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
USER node
EXPOSE 8080
CMD ["node", "dist-server/index.mjs"]
