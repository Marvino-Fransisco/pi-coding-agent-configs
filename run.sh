#!/bin/bash

case "${1:-}" in
  research)
    shift
    if [ -n "$1" ]; then
      docker exec -it pi tsx /agents/research/index.ts --auto "$@"
    else
      docker exec -it pi tsx /agents/research/index.ts
    fi
    ;;
  build)
    docker compose build
    ;;
  up)
    docker compose up -d
    ;;
  shell)
    docker exec -it pi bash
    ;;
  *)
    echo "Usage: ./run.sh <command>"
    echo ""
    echo "Commands:"
    echo "  research [topic]   Start research agent (interactive, or auto with topic)"
    echo "  build              Build the Docker image"
    echo "  up                 Start the container"
    echo "  shell              Open a shell in the container"
    ;;
esac
