FROM node:20-alpine

WORKDIR /app
COPY package.json ./
COPY server ./server

RUN addgroup -S mahjong && adduser -S mahjong -G mahjong && mkdir -p /app/data && chown -R mahjong:mahjong /app
USER mahjong

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

CMD ["node", "server/index.js"]
