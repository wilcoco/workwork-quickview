FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 DATABASE_PATH=/data/quickview.sqlite
COPY package.json ./
COPY server ./server
COPY public ./public
COPY scripts ./scripts
RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "server/app.mjs"]
