FROM node:24.14.1-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git openssh-client curl wget jq \
    ripgrep fd-find \
    build-essential python3 \
    ca-certificates \
    && ln -s /usr/bin/fdfind /usr/bin/fd \
    && rm -rf /var/lib/apt/lists/*

RUN ARCH=$(dpkg --print-architecture) \
    && wget -qO /usr/local/bin/yq "https://github.com/mikefarah/yq/releases/latest/download/yq_linux_${ARCH}" \
    && chmod +x /usr/local/bin/yq

ARG CACHEBUST=1
# RUN npm install -g @mariozechner/pi-coding-agent tsx \
    # && npm cache clean --force
RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent \
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
