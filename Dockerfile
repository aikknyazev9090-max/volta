# Сборка для Hugging Face Spaces (Docker). Подойдёт и для любого другого хостинга с Docker.
FROM node:22-bookworm-slim

# HF запускает контейнер от пользователя с uid 1000 — у образа node он уже есть
RUN mkdir -p /home/node/app && chown node:node /home/node/app
USER node
WORKDIR /home/node/app

COPY --chown=node package.json package-lock.json ./
COPY --chown=node apps/server/package.json apps/server/
COPY --chown=node apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

COPY --chown=node . .
RUN npm run build

ENV NODE_ENV=production \
    PORT=7860 \
    DEV_AUTH=false \
    LIVE_SPEED=6 \
    REAL_MONEY_ENABLED=false \
    NODE_NO_WARNINGS=1

EXPOSE 7860
WORKDIR /home/node/app/apps/server
CMD ["npx", "tsx", "src/index.ts"]
