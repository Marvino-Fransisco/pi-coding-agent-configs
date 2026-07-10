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
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"
TEAM_FILE="$PROJECT_DIR/pi/extensions/team.yaml"

HOST_WS="$(pwd)"

# ---------------------------------------------------------------------------
# Parse team.yaml — team names are lines with exactly 2-space indent
# ending with ":" and no value (e.g. "  general:")
# Fields like command/description are at 4+ space indent under each team.
# ---------------------------------------------------------------------------
parse_teams() {
  local in_teams=false
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// }" ]] && continue
    [[ "$line" == "team:" ]] && { in_teams=true; continue; }
    $in_teams || continue
    # Team name: exactly 2-space indent, "name:" with nothing after
    if [[ "$line" =~ ^\ \ ([a-zA-Z0-9_-]+):[[:space:]]*$ ]]; then
      echo "${BASH_REMATCH[1]}"
    fi
  done < "$TEAM_FILE"
}

get_team_field() {
  local team="$1" field="$2"
  local in_teams=false current=""
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// }" ]] && continue
    [[ "$line" == "team:" ]] && { in_teams=true; continue; }
    $in_teams || continue
    # Track which team block we're in
    if [[ "$line" =~ ^\ \ ([a-zA-Z0-9_-]+):[[:space:]]*$ ]]; then
      current="${BASH_REMATCH[1]}"
    fi
    # Extract the requested field from the current team block
    if [[ "$current" == "$team" ]] && [[ "$line" =~ ^[[:space:]]+${field}:[[:space:]]*(.+)$ ]]; then
      echo "${BASH_REMATCH[1]}"
      return
    fi
  done < "$TEAM_FILE"
}

ensure_container() {
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
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------
case "${1:-}" in
  up)
    ensure_container
    log "Entering container shell..."
    exec docker exec -it pi bash
    ;;
  down)
    log "Stopping container..."
    docker compose -f "$COMPOSE_FILE" down
    log "${GREEN}Container stopped${NC}"
    exit 0
    ;;
  update)
    log "Updating pi-coding-agent..."
    docker compose -f "$COMPOSE_FILE" build --build-arg CACHEBUST=$(date +%s)
    log "${GREEN}Update complete${NC}"

    if docker ps --format '{{.Names}}' | grep -q '^pi$'; then
      log "Restarting container with new image..."
      HOST_WS="$HOST_WS" docker compose -f "$COMPOSE_FILE" up -d
      log "${GREEN}Container restarted${NC}"
    fi
    exit 0
    ;;
  help|--help|-h)
    echo -e "${BOLD}Usage:${NC} pi <command|team> [options]"
    echo ""
    echo -e "${BOLD}Commands:${NC}"
    echo "  up        Start the container and open a shell inside it"
    echo "  down      Stop and remove the container"
    echo "  help      Show this help message"
    echo "  update    Update pi-coding-agent to latest version"
    echo ""
    echo -e "${BOLD}Teams:${NC}"
    while IFS= read -r team; do
      desc="$(get_team_field "$team" "description")"
      printf "  %-12s %s\n" "$team" "$desc"
    done < <(parse_teams)
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo -e "  ${CYAN}pi general${NC}       # Run the 'general' team"
    echo -e "  ${CYAN}pi <team>${NC}        # Run any team listed above"
    echo -e "  ${CYAN}pi up${NC}            # Start the container and open a shell"
    echo -e "  ${CYAN}pi down${NC}          # Stop the container"
    exit 0
    ;;
esac

# ---------------------------------------------------------------------------
# Team commands — check if arg matches a team name
# ---------------------------------------------------------------------------
if [[ -n "${1:-}" ]]; then
  for team in $(parse_teams); do
    if [[ "$1" == "$team" ]]; then
      TEAM_CMD="$(get_team_field "$team" "command")"
      if [[ -z "$TEAM_CMD" ]]; then
        log "${YELLOW}Team '$team' has no command defined in team.yaml${NC}"
        exit 1
      fi

      ensure_container

      log "Starting team ${BOLD}${team}${NC}..."
      clear
      exec docker exec -it pi $TEAM_CMD
    fi
  done

  # Unknown command
  log "${YELLOW}Unknown command: $1${NC}"
  log "Run ${BOLD}pi help${NC} for available commands and teams."
  exit 1
fi

# ---------------------------------------------------------------------------
# Default: no arguments — show help
# ---------------------------------------------------------------------------
exec "$0" help
