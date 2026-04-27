FROM node:24.14.1-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git yq openssh-client curl wget jq \
    ripgrep fd-find \
    build-essential python3 \
    ca-certificates \
    && ln -s /usr/bin/fdfind /usr/bin/fd \
    && rm -rf /var/lib/apt/lists/*

ARG CACHEBUST=1
RUN npm install -g @mariozechner/pi-coding-agent tsx \
    && npm cache clean --force

RUN mkdir -p /home/node/.pi/agent /home/node/.ssh \
    && ssh-keyscan github.com >> /home/node/.ssh/known_hosts \
    && chown -R node:node /home/node

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /workspace

USER node

ENTRYPOINT ["entrypoint.sh"]
CMD ["sleep", "infinity"]