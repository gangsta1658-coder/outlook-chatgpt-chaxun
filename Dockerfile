FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY server.mjs mail-service.mjs mail-parser.mjs microsoft-imap.py ./
COPY public ./public
COPY test ./test

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4399
ENV PYTHONDONTWRITEBYTECODE=1

USER node
EXPOSE 4399
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:4399/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
