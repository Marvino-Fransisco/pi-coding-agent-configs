FROM node:24.14.1-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl wget jq \
    ripgrep fd-find \
    build-essential python3 \
    ca-certificates \
    && ln -s /usr/bin/fdfind /usr/bin/fd \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @mariozechner/pi-coding-agent tsx \
    && npm cache clean --force

RUN mkdir -p /home/node/.pi/agent \
    && chown -R node:node /home/node

WORKDIR /workspace

USER node

CMD ["sleep", "infinity"]