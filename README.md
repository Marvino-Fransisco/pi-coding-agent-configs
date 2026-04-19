# Pi Coding Agent - Docker Setup

A containerized environment for running [pi-coding-agent](https://github.com/badlogic/pi-mono) (`@mariozechner/pi-coding-agent`) — a terminal-based AI coding assistant with a full TUI, built-in tools (read, write, edit, bash), session persistence, extensions, skills, and multiple LLM provider support.

This project provides a pre-configured Docker image with all the tools pi needs to work effectively, along with custom extensions and a personalized theme.

## What is pi-coding-agent?

pi-coding-agent is the flagship CLI from the [pi-mono](https://github.com/badlogic/pi-mono) monorepo by Mario Zechner. It is an interactive, terminal-based AI coding agent that:

- **Ships four built-in tools** — `read`, `write`, `edit`, and `bash` — giving the agent full access to your codebase
- **Runs in four modes** — interactive TUI, print/JSON (scripting), RPC (process integration), and SDK (embedding in your own apps)
- **Persists sessions** — conversation history is saved as JSONL files, organized by working directory
- **Supports extensions** — TypeScript plugins that can register tools, slash commands, intercept tool calls, and modify agent behavior
- **Supports skills** — markdown instruction files that modify agent behavior for specialized tasks
- **Manages context** — automatic context window compaction when conversations get long
- **Supports multiple providers** — Anthropic, OpenAI, ZAI, and more via `~/.pi/agent/settings.json`

## What This Project Provides

| Component | Description |
|-----------|-------------|
| **Dockerfile** | Production image based on `node:24-bookworm-slim` with pi and all required system tools |
| **docker-compose.yml** | Declarative config with volume mounts for config (`~/.pi`) and workspace |
| **Custom extensions** | Permission gate, side-by-side diffs, fun loading messages, custom footer bar |
| **Custom theme** | Dark theme (`marvino.json`) with tailored syntax highlighting and colors |
| **run.sh** | Helper script for common operations (build, up, shell, research) |
| **researches/** | Research documents on pi-mono internals (agent creation, Docker best practices) |

## Quick Start (Docker)

> **Volume mount:** Your current working directory (`pwd`) is mounted as `/workspace` inside the container. This means pi has full access to whatever project you `cd` into before running the script.

### Step 1 — Configure environment

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```
ZAI_API_KEY=your-key-here
PI_TELEMETRY=0
TAVILY_API_KEY=
GITHUB_TOKEN=
```

### Step 2 — Build the Docker image

```bash
./run.sh
```

On first run, `run.sh` automatically builds the image if it doesn't exist. This step pulls the base image and installs all dependencies, so it may take a few minutes. Subsequent runs skip the build.

### Step 3 — Start the container

After the build completes, `run.sh` automatically starts the container in the background with your current directory mounted:

```
Host: $(pwd)  →  Container: /workspace
```

### Step 4 — Connect to pi

`run.sh` automatically attaches you to the pi agent TUI. You're ready to go.

To stop the container when you're done:

```bash
./run.sh down
```

### Run from anywhere with a symlink

To use `pi` from any directory without typing the full path, create a symlink:

```bash
ln -s "$(pwd)/run.sh" /usr/local/bin/pi
```

Now you can `cd` into any project and just run:

```bash
pi
```

The script resolves its own location (even through symlinks) to find `docker-compose.yml`, so it works from anywhere.

## Usage

### run.sh commands

| Command | Description |
|---------|-------------|
| `./run.sh` (or `pi`) | Build (if needed), start container, and connect to pi agent |
| `./run.sh down` | Stop and remove the container |
| `./run.sh help` | Show help message |

### Inside the container (manual access)

If you need a shell inside the running container:

```bash
docker exec -it pi bash
```

From there you can run:

```bash
pi                                    # Start interactive TUI session
pi "List all TypeScript files"        # Start with an initial prompt
pi -p "quick question"                # Print mode (non-interactive)
tmux new -s work && pi                # Run pi inside tmux for background processes
```

## Extensions

This setup includes several custom extensions installed in `pi/agent/extensions/`:

### permission-gate.ts

Blocks dangerous bash commands before execution. Matches against patterns like `rm -rf /`, `curl | sh`, `dd if=`, and `mkfs.`. Prompts for confirmation when dangerous commands are detected.

### side-by-side-diff.ts

Replaces the default inline diff rendering for the `edit` tool with a two-column "Previous" (left) / "Now" (right) card layout with colored backgrounds highlighting deletions (red) and additions (green).

### dev-vibes.ts

Displays fun, randomized loading messages while the agent is working. Messages rotate to keep things fresh.

### custom-footer.ts

Adds a custom status bar at the bottom of the TUI showing the current working directory (left) and model name + context usage meter (right), styled in pastel yellow.

## Configuration

### Directory Structure

```
pi/agent/
  settings.json        # Global settings (model, provider, theme, etc.)
  SYSTEM.md            # System prompt for the agent
  auth.json            # Stored API keys (auto-managed)
  sessions/            # Conversation history (JSONL)
  extensions/          # TypeScript extensions (auto-loaded)
  themes/
    marvino.json       # Custom dark theme
```

### Volume Mounts

| Host path | Container path | Purpose |
|-----------|---------------|---------|
| `./pi` | `/home/node/.pi` | Agent config, sessions, extensions, themes |
| `$(pwd)` | `/workspace` | Your current working directory — project files for the agent to work on |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ZAI_API_KEY` | Yes | ZAI provider API key |
| `PI_TELEMETRY` | No | Set to `0` to disable telemetry |
| `TAVILY_API_KEY` | No | For web search capabilities |
| `GITHUB_TOKEN` | No | For GitHub API access |

### Current Model Configuration

The default setup uses ZAI as the provider with the following enabled models (configured in `pi/agent/settings.json`):

- `zai/glm-5.1` (default)
- `zai/glm-4.7`
- `zai/glm-5`
- `zai/glm-5-turbo`

Switch models at runtime with `/model` in the interactive TUI.

## Docker Image Details

- **Base image**: `node:24.14.1-bookworm-slim`
- **Installed tools**: git, curl, wget, jq, ripgrep, fd-find, tmux, vim-tiny, build-essential, python3
- **User**: `node` (non-root)
- **Philosophy**: "No background bash. Use tmux." — tmux is pre-installed and configured for managing long-running processes

## Further Reading

- [pi-mono repository](https://github.com/badlogic/pi-mono) — The monorepo containing all pi packages
- [pi-coding-agent on npm](https://www.npmjs.com/package/@mariozechner/pi-coding-agent) — Package page
- [researches/](./researches/) — Detailed research on agent creation patterns and Docker best practices
