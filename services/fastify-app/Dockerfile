# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS runtime

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY src ./src
COPY shared-queries.sql ./shared-queries.sql

ENV NODE_ENV=production
ENV FASTIFY_PORT=8002

EXPOSE 8002
CMD ["node", "src/server.js"]
