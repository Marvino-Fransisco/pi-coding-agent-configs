#!/bin/bash

BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${BOLD}${CYAN}[pi]${NC} $1"; }

RESOLVE="$0"
while [ -L "$RESOLVE" ]; do
  DIR="$(cd "$(dirname "$RESOLVE")" && pwd)"
  RESOLVE="$(readlink "$RESOLVE")"
  [[ "$RESOLVE" != /* ]] && RESOLVE="$DIR/$RESOLVE"
done
SCRIPT_DIR="$(cd "$(dirname "$RESOLVE")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"

HOST_WS="$(pwd)"

case "${1:-}" in
  down)
    log "Stopping container..."
    docker compose -f "$COMPOSE_FILE" down
    log "${GREEN}Container stopped${NC}"
    exit 0
    ;;
  help|--help|-h)
    echo -e "${BOLD}Usage:${NC} pi [command]"
    echo ""
    echo -e "${BOLD}Commands:${NC}"
    echo "  (none)    Start container and connect to pi agent"
    echo "  down      Stop and remove the container"
    echo "  help      Show this help message"
    exit 0
    ;;
esac

if ! docker image inspect pi-coding-agent:latest >/dev/null 2>&1; then
  log "${YELLOW}Image not found, building...${NC}"
  docker compose -f "$COMPOSE_FILE" build
  log "${GREEN}Build complete${NC}"
fi

if ! docker ps --format '{{.Names}}' | grep -q '^pi$'; then
  log "Mounting ${DIM}${HOST_WS}${NC} → ${DIM}/workspace${NC}"
  HOST_WS="$HOST_WS" docker compose -f "$COMPOSE_FILE" up -d
  log "${GREEN}Container started${NC}"
fi

log "Connecting..."
exec docker exec -it pi pi
