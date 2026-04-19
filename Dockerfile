FROM node:24.14.1-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl wget jq \
    ripgrep fd-find \
    tmux vim-tiny \
    build-essential python3 \
    ca-certificates \
    && ln -s /usr/bin/fdfind /usr/bin/fd \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @mariozechner/pi-coding-agent tsx \
    && npm cache clean --force

COPY .tmux.conf /home/node/.tmux.conf

RUN mkdir -p /home/node/.pi/agent \
    && chown -R node:node /home/node

WORKDIR /workspace

USER node

ENV TERM=xterm-256color
ENV COLORTERM=truecolor

CMD ["sleep", "infinity"]
