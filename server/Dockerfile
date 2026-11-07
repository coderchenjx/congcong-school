FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node server ./server
COPY --chown=node:node packages/core/package.json ./packages/core/package.json
COPY --chown=node:node packages/core/src/week.ts ./packages/core/src/week.ts
RUN mkdir /app/storage && chown node:node /app/storage
USER node
ENV API_HOST=0.0.0.0 API_PORT=3001 DATABASE_PATH=/app/storage/progress.sqlite USER_CONFIG=/app/config/users.json
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
