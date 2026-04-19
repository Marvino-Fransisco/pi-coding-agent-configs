# Docker Image for pi-coding-agent Research
> **Date**: 2026-04-19 | **Researcher**: AI Agent | **Status**: Final

---

## TL;DR

Build a production Docker image for pi-coding-agent (`@mariozechner/pi-coding-agent` v0.67.5) using `node:24-bookworm-slim` as the base, installing tmux and essential CLI tools (git, curl, wget, jq, ripgrep, fd-find, build-essential, python3), running as a non-root user with proper volume mounts for `~/.pi/agent/` and project directories. The container should use a custom entrypoint script that optionally launches tmux and then drops the user into a bash shell where they can start `pi` manually (Option A pattern). Use `docker-compose.yml` for declarative volume and environment configuration. The current Dockerfile has **7 bugs/issues** that need fixing.

---

## Context

- **Why this research was triggered**: User has a minimal Dockerfile with multiple issues and wants a production-quality container for running pi-coding-agent, a terminal-based AI coding agent by Mario Zechner
- **Current stack**: Node.js (TypeScript-based CLI), npm global install, ZAI as LLM provider, macOS Docker Desktop
- **Key constraint**: pi-coding-agent's philosophy is "No background bash. Use tmux." — tmux is a core tool, not optional
- **Decision needed by**: Before next image build

---

## Scope

**In scope**:
- pi-coding-agent runtime requirements (Node.js version, dependencies, env vars, config dirs)
- tmux integration strategy
- System tools needed inside the container
- Docker best practices (base image, layering, security, caching, size)
- Entrypoint/runtime pattern selection
- docker-compose vs plain Docker
- Issues in the current Dockerfile

**Out of scope**:
- pi-coding-agent extensions, skills, or custom providers (user configures those)
- Multi-architecture builds (user runs macOS/Docker Desktop — x86_64 and arm64 both supported by node:24)
- CI/CD pipeline integration
- Kubernetes deployment

---

## Options Evaluated

1. **Option A** — `CMD ["sleep", "infinity"]` + user `docker exec` into container, runs `pi` manually
2. **Option B** — `CMD ["tmux"]` as entrypoint, user attaches and runs `pi`
3. **Option C** — `CMD ["pi"]` directly, agent starts immediately
4. **Option D** — Custom entrypoint script that sets up tmux + pi together

> Options NOT evaluated: Alpine-based images (known glibc issues with some Node.js native modules including `@silvia-odwyer/photon-node` used by pi for image processing), multi-stage builds (no build step needed — pi is installed via npm)

---

## Comparison Matrix

| Criterion | Option A (sleep + exec) | Option B (tmux) | Option C (pi direct) | Option D (custom entrypoint) |
|-----------|------------------------|-----------------|---------------------|------------------------------|
| Flexibility | ⭐ Full control | ✅ Good | ❌ Rigid | ✅ Good |
| tmux support | ⚠️ Manual setup | ⭐ Built-in | ❌ None | ⭐ Built-in |
| Debugging | ✅ Easy | ✅ Easy | ⚠️ Hard (TUI in container) | ✅ Easy |
| Reproducibility | ⚠️ Manual steps | ✅ Automated | ✅ Automated | ⭐ Automated + configurable |
| Container lifecycle | ✅ Stays running | ✅ Stays running | ❌ Exits when pi quits | ✅ Stays running |
| Secret handling | ✅ --env-file at run | ✅ --env-file at run | ✅ --env-file at run | ✅ --env-file at run |
| **Overall** | ⭐ Recommended | Good | Not recommended | Good (over-engineered) |

---

## Deep Dive

### 1. pi-coding-agent Requirements

#### Runtime Dependencies

| Requirement | Value | Source |
|-------------|-------|--------|
| Node.js version | `>=20.6.0` (specified in `package.json` engines field) | `packages/coding-agent/package.json` |
| npm packages | Installed globally via `npm install -g @mariozechner/pi-coding-agent` | npm page |
| Native modules | `@silvia-odwyer/photon-node` (optional dep, WASM-based image processing) | `package.json` optionalDependencies |
| Shell | `/bin/bash` (hard requirement — pi spawns `bash -c <command>`) | `packages/coding-agent/src/utils/shell.ts` |
| Current version | `0.67.5` | `package.json` |

**Key finding from source code**: pi's bash tool (`packages/coding-agent/src/core/tools/bash.ts`) spawns commands via `spawn(shell, [...args, command], { cwd, detached: true, ... })` where shell resolves to `/bin/bash` on Unix systems. The `detached: true` flag means it creates process groups, which is relevant for signal handling and process tree cleanup. The shell resolution order is: `shellPath` from settings → `/bin/bash` → `bash` on PATH → fallback to `sh`.

#### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ZAI_API_KEY` | ZAI provider API key | Yes (user's provider) |
| `ANTHROPIC_API_KEY` | Anthropic API key | No (alternative) |
| `OPENAI_API_KEY` | OpenAI API key | No (alternative) |
| `PI_CODING_AGENT_DIR` | Override config directory (default: `~/.pi/agent`) | No |
| `PI_TELEMETRY` | Telemetry opt-out: set to `0`/`false`/`no` | No |
| `PI_CACHE_RETENTION` | Set to `long` for extended prompt cache | No |
| `PI_SKIP_VERSION_CHECK` | Skip version check at startup | No |
| `PI_PACKAGE_DIR` | Override package directory | No |
| `VISUAL` / `EDITOR` | External editor for Ctrl+G | No |
| `PI_HARDWARE_CURSOR` | Set to `1` for hardware cursor in IntelliJ terminal | No |

**Source**: npm page README and `packages/coding-agent/package.json`

#### Config & Data Directories

| Directory | Purpose | Needs Persistence |
|-----------|---------|-------------------|
| `~/.pi/agent/` | Main config directory | ⭐ Yes |
| `~/.pi/agent/settings.json` | Global settings | Yes |
| `~/.pi/agent/auth.json` | Stored API keys and OAuth tokens (permissions 0600) | Yes |
| `~/.pi/agent/sessions/` | Session JSONL files (organized by working directory) | Yes |
| `~/.pi/agent/extensions/` | TypeScript extensions | Yes |
| `~/.pi/agent/skills/` | Agent skill definitions | Yes |
| `~/.pi/agent/prompts/` | Prompt templates | Yes |
| `~/.pi/agent/themes/` | Custom themes | Yes |
| `~/.pi/agent/git/` | Git-installed pi packages | Yes |
| `~/.pi/agent/models.json` | Custom provider/model definitions | Yes |
| `.pi/` (project-local) | Project settings, extensions, skills, prompts | N/A (mounted as workspace) |
| `AGENTS.md` / `CLAUDE.md` | Project context files loaded at startup | N/A (in workspace) |

**Source**: npm page, `packages/coding-agent/docs/settings.md`

#### GitHub Findings

- **Repository**: `badlogic/pi-mono` (monorepo with 7 packages)
- **Coding agent package**: `packages/coding-agent/`
- **No existing Dockerfile** in the repository — pi-coding-agent does not ship official container images
- **No Docker-related issues** found in the GitHub issue tracker (searched `docker OR container`)
- **Issue #3158** (closed/abandoned): A community PR attempted to add tmux-style terminal multiplexing directly into pi's TUI with split panes, tabs, and PTY support. It was auto-closed by the repo's contributor policy (requires opening an issue first). This confirms that tmux is the recommended approach for multiplexing, not a built-in feature.
- **BashOperations interface** is designed for containerization: the code explicitly documents that extensions can route bash execution to Docker containers, SSH, or Firecracker microVMs without modifying upstream code.
- **tmux detection**: pi's TUI detects `$TMUX` environment variable and adjusts behavior (disables OSC 8 hyperlinks when running inside tmux, falls back to xterm modifyOtherKeys mode 2 for keyboard protocol compatibility).

---

### 2. Recommended System Tools

#### Category: Search & File Discovery

| Tool | Debian Package | Install Command | Priority |
|------|---------------|-----------------|----------|
| ripgrep | `ripgrep` | `apt install -y ripgrep` | ⭐ High (pi has built-in `grep` tool, but rg is the underlying engine) |
| fd-find | `fd-find` | `apt install -y fd-find` (provides `/usr/bin/fdfind`) | ⭐ High (pi has built-in `find` tool, fd is commonly invoked by the agent) |
| grep | `grep` | Pre-installed on Debian | ✅ Included |
| find | `findutils` | Pre-installed on Debian | ✅ Included |

**Note on fd-find**: On Debian Bookworm, the package is `fd-find` and the binary is installed as `fdfind`. To get the `fd` command name, create a symlink: `ln -s /usr/bin/fdfind /usr/bin/fd`. The current Dockerfile incorrectly uses `fd` which doesn't exist on Debian.

#### Category: File Operations & Networking

| Tool | Debian Package | Install Command | Priority |
|------|---------------|-----------------|----------|
| git | `git` | `apt install -y git` | ⭐ High (the agent frequently uses git commands) |
| curl | `curl` | `apt install -y curl` | ⭐ High (API calls, downloading files) |
| wget | `wget` | `apt install -y wget` | ✅ Medium (alternative downloader) |
| jq | `jq` | `apt install -y jq` | ✅ Medium (JSON processing in bash) |
| ca-certificates | `ca-certificates` | `apt install -y ca-certificates` | ⭐ High (HTTPS for API calls) |

#### Category: Text Processing

| Tool | Source | Priority |
|------|--------|----------|
| sed, awk, sort, uniq, diff, patch | Pre-installed on Debian Bookworm | ✅ Included |
| file | `file` package | ✅ Medium |

#### Category: Editors

| Tool | Install Command | Priority |
|------|-----------------|----------|
| vim | `apt install -y vim-tiny` or `vim` | ✅ Medium (fallback for `$EDITOR`, useful in tmux) |
| nano | `apt install -y nano` | ⚠️ Optional (lighter alternative to vim) |

#### Category: Process Management

| Tool | Install Command | Priority |
|------|-----------------|----------|
| tmux | `apt install -y tmux` | ⭐ High (core recommendation by pi) |
| procps | `procps` (pre-installed) | ✅ Included (provides `ps`) |
| htop | `apt install -y htop` | ⚠️ Optional (monitoring) |

#### Category: Build Tools (for node-gyp native modules)

| Tool | Install Command | Priority |
|------|-----------------|----------|
| build-essential | `apt install -y build-essential` | ✅ Medium (compiles native Node.js addons) |
| pkg-config | `pkg-config` | Included with build-essential | ✅ Medium |
| python3 | `python3` | `apt install -y python3` | ✅ Medium (required by node-gyp) |
| make | `make` | Included with build-essential | ✅ Medium |

**Rationale for build-essential + python3**: While pi-coding-agent itself is pure JavaScript/TypeScript, the agent's bash tool may install npm packages that have native dependencies (e.g., when using `pi install npm:...`). Node-gyp requires `make`, `gcc/g++`, and Python to compile native addons.

#### Category: Shell

| Tool | Source | Notes |
|------|--------|-------|
| bash | Pre-installed at `/bin/bash` | Required by pi-coding-agent |
| sh | Pre-installed at `/bin/sh` | Fallback shell |

**Recommended consolidated install**:
```bash
apt-get update && apt-get install -y --no-install-recommends \
    git curl wget jq \
    ripgrep fd-find \
    tmux vim-tiny \
    build-essential python3 \
    ca-certificates \
    && ln -s /usr/bin/fdfind /usr/bin/fd \
    && rm -rf /var/lib/apt/lists/*
```

**Note**: `--no-install-recommends` prevents installing suggested packages, reducing image size significantly (typically 30-50% smaller).

---

### 3. tmux Integration Strategy

#### Why tmux Is Core to pi-coding-agent

pi's philosophy explicitly states: **"No background bash. Use tmux."** This means:
- pi does not implement background process management internally
- Users who need long-running processes (dev servers, watchers, etc.) should run them in tmux panes
- tmux provides full observability — you can see, interact with, and kill background processes directly
- The agent's bash tool spawns processes with `detached: true`, which means background processes from tool calls are tracked but not directly observable from within pi's TUI

#### tmux Detection in pi

From source code analysis (`packages/coding-agent/src/core/tools/bash.ts` and TUI code):
- pi detects tmux via the `$TMUX` environment variable
- When running inside tmux, pi automatically falls back from Kitty keyboard protocol to xterm `modifyOtherKeys` mode 2
- OSC 8 hyperlinks are disabled inside tmux (most tmux hosts silently swallow these sequences)

#### Recommended tmux Version

- Debian Bookworm ships tmux **3.3a** (released 2022) — this is more than sufficient
- No specific minimum version is required by pi-coding-agent
- tmux 3.3a supports all features needed: sessions, windows, panes, `send-keys`, `split-window`, etc.

#### tmux Role in the Container

tmux should be **available as a tool** inside the container, not the entrypoint. Rationale:
1. The user may want to run pi directly without tmux for simple tasks
2. tmux inside Docker requires proper terminal allocation (`-it` flags), which the user already provides
3. tmux sessions persist within the container lifecycle, which aligns with the "sleep infinity" pattern
4. pi itself handles its own TUI rendering — wrapping it in tmux adds an unnecessary layer for interactive mode

**Recommended workflow inside the container**:
```bash
# Option 1: Run pi directly
pi

# Option 2: Start tmux, then run pi in a pane
tmux new -s work
pi

# Option 3: Run pi, then start a background process in a new tmux pane
tmux new-session -d -s bg 'npm run dev'
tmux attach -s bg
```

#### tmux Configuration

No special tmux configuration is required for pi-coding-agent. However, a minimal `.tmux.conf` is recommended:

```tmux
# Increase scrollback buffer for agent output
set -g history-limit 50000

# Enable 256-color support (pi's TUI uses colors)
set -g default-terminal "tmux-256color"

# Set escape time to 0 for snappy key response
set -sg escape-time 0
```

---

### 4. Docker Image Best Practices

#### Base Image Recommendation

| Base Image | Size (approx) | glibc | Pros | Cons |
|------------|---------------|-------|------|------|
| `node:24-bookworm` | ~1.1 GB | ✅ Full | Full Debian, all tools available | Large image |
| `node:24-bookworm-slim` | ~250 MB | ✅ Full | Smaller, still has apt | Some packages need extra install |
| `node:24-alpine` | ~180 MB | ❌ musl libc | Smallest | glibc incompatibility with native modules |

**⭐ Recommendation: `node:24-bookworm-slim`**

Rationale:
1. pi-coding-agent uses `@silvia-odwyer/photon-node` (optional dependency) which may have native bindings requiring glibc
2. `build-essential` and `python3` for node-gyp are readily available via apt on Debian but require extra work on Alpine
3. The `slim` variant saves ~850 MB vs full `bookworm` while maintaining full apt compatibility
4. Alpine's musl libc causes runtime errors with many Node.js native modules (well-documented issue)
5. After installing all recommended tools, the slim image will be ~400-500 MB — acceptable for a development tool

**User's current choice**: `node:24.14.1-bookworm` — this pins to a specific Node.js patch version which is good for reproducibility but the full bookworm image adds unnecessary size. Consider `node:24-bookworm-slim` or `node:24.14.1-bookworm-slim` if the exact patch version matters.

#### Dockerfile Structure

Recommended layer ordering (optimized for rebuild caching):

```dockerfile
# Layer 1: Base image (rarely changes)
FROM node:24-bookworm-slim

# Layer 2: System packages (changes rarely, cached well)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl wget jq ripgrep fd-find tmux vim-tiny \
    build-essential python3 ca-certificates \
    && ln -s /usr/bin/fdfind /usr/bin/fd \
    && rm -rf /var/lib/apt/lists/*

# Layer 3: pi-coding-agent (changes on version bumps)
RUN npm install -g @mariozechner/pi-coding-agent

# Layer 4: Non-root user setup (rarely changes)
ARG USER=dev
ARG UID=1000
ARG GID=1000
RUN groupadd -g ${GID} ${USER} \
    && useradd -m -u ${UID} -g ${GID} -s /bin/bash ${USER}

# Layer 5: Config and workspace setup
RUN mkdir -p /home/${USER}/.pi/agent \
    && chown -R ${USER}:${USER} /home/${USER}

WORKDIR /workspace

# Layer 6: Runtime
USER ${USER}
ENV PI_TELEMETRY=0
CMD ["sleep", "infinity"]
```

**Layer caching rationale**:
- System packages rarely change → cached across rebuilds
- npm install changes when pi version bumps → only this layer rebuilds
- User setup is static → always cached
- Each layer is independently cacheable

#### Security Considerations

| Concern | Recommendation | Rationale |
|---------|---------------|-----------|
| **Root user** | 🔴 Run as non-root | pi-coding-agent's bash tool executes arbitrary commands — running as root in a container that has mounted host directories is a critical risk |
| **API keys** | ✅ Use `--env-file` | Never bake secrets into the image. The user already does this correctly |
| **Network** | ✅ Default bridge network is fine | pi only needs outbound HTTPS to LLM provider APIs. No inbound ports needed |
| **Volume mounts** | ⚠️ Scope carefully | Mount only what's needed. A workspace mount with write access is necessary but should be scoped |
| **`--privileged` flag** | ❌ Never use | No capability escalation needed |
| **Image content** | ✅ No secrets in image | The `.env` file must never be COPY'd into the image |

**Non-root user trade-off**: Running as non-root (UID 1000) means:
- ✅ If the agent goes rogue, it can't modify system files
- ✅ Matches typical host UID on macOS (Docker Desktop handles UID mapping)
- ⚠️ npm global packages are installed as root (in the build stage) but accessible to the non-root user
- ⚠️ Some `apt install` operations in the container at runtime would need `sudo` — but this shouldn't happen if all tools are pre-installed

#### Volume Mount Strategy

| Mount | Host Path | Container Path | Purpose |
|-------|-----------|---------------|---------|
| Config | `~/.pi/agent/` | `/home/dev/.pi/agent/` | Sessions, settings, auth, extensions, skills |
| Workspace | `./` (project dir) | `/workspace` | Project files the agent works on |
| (Optional) tmux socket | (not needed) | `/tmp` | tmux socket is ephemeral, doesn't need persistence |

**Priority mounts**:
1. `~/.pi/agent/` → **Essential**: Without this, sessions are lost on container removal, settings aren't persisted, and auth.json must be reconfigured every time
2. Project workspace → **Essential**: The agent needs files to work on
3. `~/.ssh/` → **Optional**: If the agent needs git push/pull with SSH keys

---

### 5. Entrypoint & Runtime Pattern

#### Recommended: Option A — `sleep infinity` + Manual `pi` Start

```dockerfile
CMD ["sleep", "infinity"]
```

**Why this is the best choice**:
1. **Container stays running**: The `sleep infinity` pattern keeps the container alive, allowing the user to `docker exec -it <container> bash` multiple times
2. **Maximum flexibility**: The user can run pi, tmux, or any other command inside the container
3. **tmux sessions persist**: If the user starts tmux inside the container, sessions survive across `docker exec` disconnections
4. **Debuggable**: Easy to `exec` into the container and inspect the environment
5. **Matches user's existing workflow**: The user's current `run.sh` drops into bash, which is the expected pattern

**How it works**:
```bash
# Start the container
docker run --rm -it --env-file .env \
    -v ~/.pi/agent:/home/dev/.pi/agent \
    -v $(pwd):/workspace \
    pi-coding-agent:latest

# Inside the container, user runs:
pi                          # Start pi directly
tmux new -s work && pi      # Start pi in tmux
pi -p "quick question"      # Non-interactive mode
```

#### Why NOT the Other Options

| Option | Why Not |
|--------|---------|
| **B (tmux entrypoint)** | Forces tmux on every session. Adds complexity. User may want plain bash. tmux inside Docker with `-it` requires careful signal handling. |
| **C (pi direct)** | When pi exits (Ctrl+C twice, `/quit`), the container stops. No way to re-enter. Cannot run other commands. Cannot debug. |
| **D (custom entrypoint)** | Over-engineered for current needs. A shell alias or function achieves the same with less complexity. |

---

### 6. docker-compose Recommendation

**⭐ Yes, use docker-compose.yml.**

Rationale:
1. **Declarative volume mounts**: No more remembering long `docker run` flags
2. **Environment file handling**: `env_file:` directive replaces `--env-file`
3. **Reproducibility**: The exact configuration is version-controlled
4. **Workspace flexibility**: Easy to change the mounted project directory

**Recommended docker-compose.yml structure**:
```yaml
services:
  pi:
    build: .
    image: pi-coding-agent:latest
    stdin_open: true    # -i
    tty: true           # -t
    env_file:
      - .env
    volumes:
      - ~/.pi/agent:/home/dev/.pi/agent
      - .:/workspace
    working_dir: /workspace
    # No ports needed (no inbound traffic)
    # No restart policy needed (development tool)
```

**Benefits over run.sh**:
- `docker compose up` replaces `./run.sh`
- `docker compose exec pi bash` replaces `docker exec -it <container> bash`
- Adding/removing volume mounts doesn't require editing a shell script
- Multiple environments (dev, prod) can be defined with multiple compose files

---

### 7. Issues Found in Current Dockerfile

The current Dockerfile at `/Users/marvino/Documents/tools/pi-coding-agent/Dockerfile`:

```dockerfile
FROM node:24.14.1-bookworm
RUN apt update && apt install -y \
    fd && ripgrep \
    && npm install -g @mariozechner/pi-coding-agent
CMD ["sleep", "infinity"]
```

| # | Issue | Severity | Details |
|---|-------|----------|---------|
| 1 | **Wrong package name for fd** | 🔴 Critical | `fd` is not a valid Debian package. On Debian Bookworm, it's `fd-find` (binary: `fdfind`). This causes the `apt install` to fail, breaking the entire build. |
| 2 | **Missing `&&` after last apt package** | 🔴 Critical | Line 4 ends with `ripgrep \` but line 5 starts with `&& npm install`. The backslash continues the `apt install` command, so `&& npm install` is treated as an argument to `apt install`, not a separate command. The `npm install` never runs. |
| 3 | **Missing tmux** | 🟡 Medium | pi-coding-agent's core philosophy is "No background bash. Use tmux." tmux is not installed. |
| 4 | **Missing essential tools** | 🟡 Medium | git, curl, build-essential, python3, ca-certificates, jq are all missing. These are commonly invoked by the agent's bash tool. |
| 5 | **No apt cache cleanup** | 🟡 Medium | `rm -rf /var/lib/apt/lists/*` is not run after apt install, adding ~30-50 MB of unnecessary image bloat. |
| 6 | **Running as root** | 🟡 Medium | No `USER` directive. The container runs as root, which is a security concern when the agent executes arbitrary bash commands and has mounted host directories. |
| 7 | **Full bookworm image** | 🟢 Low | `node:24.14.1-bookworm` instead of `node:24-bookworm-slim`. The full image is ~1.1 GB vs ~250 MB for slim. Pinning the patch version is good for reproducibility. |
| 8 | **No `--no-install-recommends`** | 🟢 Low | Without this flag, apt installs recommended packages, adding unnecessary size. |

**Impact**: Issues #1 and #2 together mean the current Dockerfile **will not build successfully**. The `apt install` command fails because `fd` doesn't exist as a package name, and even if it did, the `npm install` command would be consumed as an apt argument.

---

## Trade-off Analysis

| | sleep infinity (Option A) | tmux entrypoint (Option B) | pi direct (Option C) | bookworm-slim | bookworm full |
|--|---------------------------|---------------------------|---------------------|---------------|---------------|
| **Gains** | Max flexibility, debuggable, tmux persists | tmux always ready | Simplest | ~850 MB smaller | All packages available |
| **Loses** | Requires manual pi start | Forces tmux, harder debugging | Container dies with pi | Some packages need explicit install | 850 MB extra |
| **Best for** | Development, debugging, multi-session | Dedicated tmux workflows | CI/CD or single-task pipelines | Production, shared images | Quick prototyping |
| **Avoid if** | You want zero-friction startup | User doesn't know tmux | You need to re-enter container | You need many obscure packages | Image size matters |

---

## Recommendation

> **Adopt Option A (`sleep infinity`) with `node:24-bookworm-slim` base image, non-root user, and docker-compose.yml for orchestration.**

**Justification**:
1. The current Dockerfile **will not build** due to wrong `fd` package name and broken `&&` chaining — this is the immediate blocker
2. `node:24-bookworm-slim` reduces image size by ~850 MB with no functional loss — pi-coding-agent and all its dependencies work correctly with glibc
3. Running as non-root is a security necessity when the agent executes arbitrary bash commands against mounted host directories
4. tmux should be **installed and available** but not forced as the entrypoint — this respects pi's philosophy while maintaining user flexibility
5. docker-compose.yml eliminates the need for `run.sh` and makes the configuration declarative and version-controllable

**Priority action items** (in order):
1. Fix the broken Dockerfile (issues #1 and #2 are build-breaking)
2. Add missing essential tools (tmux, git, curl, build-essential, python3)
3. Add apt cache cleanup for image size
4. Add non-root user
5. Create docker-compose.yml
6. Add `--no-install-recommends` and consider slim base image
7. Add `PI_TELEMETRY=0` environment variable

---

## Migration / Adoption Path

> Estimated effort: 30 minutes
> Risk: Low

- [ ] Step 1: Fix Dockerfile — correct `fd` → `fd-find`, fix `&&` chaining, add all recommended tools
- [ ] Step 2: Add non-root user with ARGs for UID/GID
- [ ] Step 3: Add apt cache cleanup (`rm -rf /var/lib/apt/lists/*`)
- [ ] Step 4: Create `docker-compose.yml` with volume mounts and env_file
- [ ] Step 5: Test build: `docker compose build`
- [ ] Step 6: Test run: `docker compose up -d` then `docker compose exec pi bash` then `pi --version`
- [ ] Step 7: Verify tmux works: `tmux new -s test` inside the container
- [ ] Step 8: Verify pi works: `pi -p "echo hello"` (non-interactive test)
- [ ] Step 9: Remove or update `run.sh` (docker compose replaces it)

**Rollback plan**: Keep the current Dockerfile as `Dockerfile.old` until the new one is verified.

---

## Open Questions

- [ ] Should the image include language runtimes beyond Node.js (Python, Go, Rust)? This depends on the user's project types. [Opinion: Start without them, add via docker-compose volumes or multi-stage if needed]
- [ ] Should `~/.ssh/` be mounted for git SSH operations? This depends on whether the user pushes/pulls via SSH or HTTPS. [Recommendation: Make it an optional volume mount in docker-compose, commented out]
- [ ] Is `node:24.14.1` patch version pinning intentional? If so, `node:24.14.1-bookworm-slim` should be used. If not, `node:24-bookworm-slim` allows automatic patch updates. [Unknown: User intent]
- [ ] Does the user need Docker-in-Docker (dind) for the agent to run container commands? [Unknown: Not mentioned in requirements, assume no]

---

## References

| Source | URL | Date accessed |
|--------|-----|---------------|
| pi-coding-agent npm page | https://www.npmjs.com/package/@mariozechner/pi-coding-agent | 2026-04-19 |
| pi-mono GitHub repository | https://github.com/badlogic/pi-mono | 2026-04-19 |
| package.json (engines, deps) | `packages/coding-agent/package.json` in badlogic/pi-mono | 2026-04-19 |
| Settings documentation | `packages/coding-agent/docs/settings.md` in badlogic/pi-mono | 2026-04-19 |
| Terminal setup guide | `packages/coding-agent/docs/terminal-setup.md` in badlogic/pi-mono | 2026-04-19 |
| Bash tool source code | `packages/coding-agent/src/core/tools/bash.ts` in badlogic/pi-mono | 2026-04-19 |
| Shell utility source code | `packages/coding-agent/src/utils/shell.ts` in badlogic/pi-mono | 2026-04-19 |
| Bash executor & sandboxing docs | https://zread.ai/badlogic/pi-mono/16-bash-executor-and-sandboxing | 2026-04-19 |
| Providers documentation | `packages/coding-agent/docs/providers.md` in badlogic/pi-mono | 2026-04-19 |
| Issue #3158 (tmux multiplexer PR) | https://github.com/badlogic/pi-mono/issues/3158 | 2026-04-19 |
| Issue #3103 (tmux hyperlink fix) | https://github.com/badlogic/pi-mono/issues/3103 | 2026-04-19 |
| Node.js Docker guide | https://nodejs.org/en/docs/guides/nodejs-docker-webapp | 2026-04-19 |
| User's current Dockerfile | `/Users/marvino/Documents/tools/pi-coding-agent/Dockerfile` | 2026-04-19 |
| User's current run.sh | `/Users/marvino/Documents/tools/pi-coding-agent/run.sh` | 2026-04-19 |
