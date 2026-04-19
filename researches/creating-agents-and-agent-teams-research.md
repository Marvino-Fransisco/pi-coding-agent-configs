# Creating Agents and Agent Teams in pi-coding-agent Research
> **Date**: 2026-04-19 | **Researcher**: AI Agent | **Status**: Final

---

## TL;DR

pi-coding-agent provides a **three-layer agent creation API**: (1) the low-level `Agent` class from `@mariozechner/pi-agent-core` for full control, (2) the `createAgentSession()` SDK from `@mariozechner/pi-coding-agent` for production-ready sessions with auth, extensions, and persistence, and (3) the MOM package for chat-platform agents (Slack/Discord). **There is NO built-in multi-agent orchestration or agent team framework.** The architecture is fundamentally single-agent. To build agent teams, you must create multiple `Agent` instances manually and build your own orchestration layer on top. The MOM package demonstrates a "team-like" pattern where one agent is created per channel, but agents are isolated and do not coordinate with each other.

---

## Context

- **Why this research was triggered**: User wants to understand how to create agents and agent teams within the pi-coding-agent ecosystem
- **Current stack**: TypeScript monorepo (`badlogic/pi-mono`) with packages: `pi-ai` (LLM API), `pi-agent-core` (agent runtime), `pi-coding-agent` (coding agent SDK), `pi-tui` (terminal UI), `pi-mom` (chat bot), `pi-pods` (GPU deployment)
- **Key constraint**: pi-coding-agent is designed as a single-agent system — multi-agent orchestration must be built by the user
- **Decision needed by**: Before designing an agent team architecture on top of pi-coding-agent

---

## Scope

**In scope**:
- How to create individual agents at each abstraction layer
- Agent tools, system prompts, and event handling
- Available patterns for multi-agent coordination
- MOM package as a reference for channel-isolated agents
- Extensions and skills as mechanisms for agent behavior customization

**Out of scope**:
- Building a complete multi-agent framework (this is a research report, not an implementation)
- `pi-pods` package (GPU deployment, unrelated to agent creation)
- `pi-tui` package (terminal UI rendering, not agent logic)
- Web UI (`packages/web-ui`)

---

## Options Evaluated

### Agent Creation Approaches

1. **Option A** — Low-level `Agent` class (`@mariozechner/pi-agent-core`)
2. **Option B** — SDK `createAgentSession()` (`@mariozechner/pi-coding-agent`)
3. **Option C** — MOM Agent (`@mariozechner/pi-mom`)

### Agent Team Approaches

1. **Option X** — Channel-per-agent isolation (MOM pattern)
2. **Option Y** — Manual multi-agent orchestration (build your own)
3. **Option Z** — Single agent with skills/extension-based role switching

---

## Comparison Matrix — Agent Creation

| Criterion | Option A (Agent class) | Option B (createAgentSession) | Option C (MOM Agent) |
|-----------|----------------------|-------------------------------|---------------------|
| Abstraction level | Low (you handle everything) | High (session, auth, persistence) | Highest (platform adapter) |
| Flexibility | ⭐ Full control | ✅ Good | ⚠️ Opinionated for chat |
| Session persistence | ❌ Manual | ⭐ Built-in (JSONL) | ⭐ Built-in (JSONL) |
| Auth/API key management | ❌ Manual | ⭐ Built-in (AuthStorage) | ⭐ Built-in |
| Extensions support | ❌ None | ⭐ Full | ✅ Partial |
| Skills support | ❌ None | ⭐ Full | ⭐ Full |
| Compaction (context window mgmt) | ❌ None | ⭐ Built-in | ⭐ Built-in |
| Model switching mid-session | ✅ Manual | ⭐ Built-in | ❌ Fixed model |
| Tool execution hooks | ⭐ beforeToolCall/afterToolCall | ⭐ Same + extensions | ⭐ Same |
| Proxy support | ⭐ streamProxy() | ⭐ Via options | ❌ None |
| Best for | Custom agent apps, research | Production coding agents | Chat bots (Slack/Discord) |
| Package | `@mariozechner/pi-agent-core` | `@mariozechner/pi-coding-agent` | `@mariozechner/pi-mom` |

---

## Comparison Matrix — Agent Teams

| Criterion | Option X (Channel isolation) | Option Y (Manual orchestration) | Option Z (Single agent + skills) |
|-----------|------------------------------|----------------------------------|----------------------------------|
| True multi-agent | ⚠️ Isolated, not coordinated | ⭐ Yes | ❌ No (one agent, many roles) |
| Inter-agent communication | ❌ None | ⭐ Custom implementation | N/A |
| Shared state | ⚠️ Via filesystem only | ⭐ Any mechanism | ⭐ Built-in (single context) |
| Complexity | ✅ Low | 🔴 High | ✅ Low |
| Fault isolation | ⭐ Per-channel | ⭐ Per-agent | ❌ Single point of failure |
| Demonstrated in codebase | ⭐ MOM package | ❌ Not demonstrated | ⭐ Skills system |
| Scalability | ⭐ Horizontal (add channels) | ⚠️ Depends on orchestrator | ❌ Single model bottleneck |
| **Overall** | Good for independent tasks | Best for coordinated teams | Good for role-switching |

---

## Deep Dive

### 1. Option A — Low-level `Agent` Class

**Package**: `@mariozechner/pi-agent-core`
**Source**: `packages/agent/src/agent.ts`, `packages/agent/src/types.ts`

#### What it is

The `Agent` class is the core stateful agent runtime. It wraps an event-driven loop that: sends messages to an LLM, streams responses, executes tool calls, feeds results back, and repeats until the agent stops.

#### Constructor

```typescript
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";

const agent = new Agent({
  // Required: initial state
  initialState: {
    systemPrompt: "You are a helpful coding assistant.",
    model: getModel("anthropic", "claude-sonnet-4-5"),
    thinkingLevel: "medium",  // "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
    tools: [myTool1, myTool2],
    messages: [],  // optional: pre-load messages
  },

  // Required: convert AgentMessage[] to LLM Message[]
  convertToLlm: (messages) => messages.filter(
    (m) => m.role === "user" || m.role === "assistant" || m.role === "toolResult"
  ),

  // Optional: transform context before each LLM call
  transformContext: async (messages, signal) => pruneOldMessages(messages),

  // Optional: custom stream function (for proxy backends)
  streamFn: streamSimple,  // default

  // Optional: dynamic API key resolution
  getApiKey: async (provider) => getApiKeyForProvider(provider),

  // Optional: session ID for provider caching
  sessionId: "session-123",

  // Optional: tool execution hooks
  beforeToolCall: async ({ toolCall, args, context }) => {
    if (toolCall.name === "dangerous_tool") {
      return { block: true, reason: "not allowed" };
    }
  },
  afterToolCall: async ({ toolCall, result, isError }) => {
    if (!isError) {
      return { details: { ...result.details, audited: true } };
    }
  },

  // Optional: steering/follow-up modes
  steeringMode: "one-at-a-time",  // or "all"
  followUpMode: "one-at-a-time",   // or "all"

  // Optional: thinking budgets for token-based providers
  thinkingBudgets: { minimal: 128, low: 512, medium: 1024, high: 2048 },

  // Optional: transport protocol ("sse" or "streamable-http")
  transport: "sse",
});
```

#### Key Methods

| Method | Description |
|--------|-------------|
| `agent.prompt(text)` | Start a new prompt from text or AgentMessage |
| `agent.prompt(text, images)` | Start a prompt with images |
| `agent.continue()` | Continue from existing context (after error) |
| `agent.steer(message)` | Inject a message mid-run (after current turn) |
| `agent.followUp(message)` | Queue a message after agent would stop |
| `agent.abort()` | Cancel the current run |
| `agent.waitForIdle()` | Promise that resolves when run finishes |
| `agent.reset()` | Clear all state and queues |
| `agent.subscribe(listener)` | Subscribe to events, returns unsubscribe function |

#### Event System

```typescript
agent.subscribe(async (event, signal) => {
  switch (event.type) {
    case "agent_start": break;
    case "agent_end": break;
    case "turn_start": break;
    case "turn_end": break;
    case "message_start": break;
    case "message_update":  // Only for assistant messages (streaming)
      process.stdout.write(event.assistantMessageEvent.delta);
      break;
    case "message_end": break;
    case "tool_execution_start": break;
    case "tool_execution_update": break;
    case "tool_execution_end": break;
  }
});
```

#### Defining Tools

```typescript
import { Type } from "@sinclair/typebox";

const myTool = {
  name: "read_file",
  label: "Read File",  // For UI display
  description: "Read a file's contents",
  parameters: Type.Object({
    path: Type.String({ description: "File path" }),
  }),
  // Optional: prepare raw arguments before schema validation
  prepareArguments: (args) => ({ path: String(args.path) }),
  // Execute the tool — throw on error, return content on success
  execute: async (toolCallId, params, signal, onUpdate) => {
    const content = await fs.readFile(params.path, "utf-8");
    // Optional: stream progress
    onUpdate?.({ content: [{ type: "text", text: "Reading..." }], details: {} });
    return {
      content: [{ type: "text", text: content }],
      details: { path: params.path, size: content.length },
    };
  },
};

agent.state.tools = [myTool];
```

#### Custom Message Types

```typescript
// Extend AgentMessage via declaration merging
declare module "@mariozechner/pi-agent-core" {
  interface CustomAgentMessages {
    "my-custom": { role: "my-custom"; data: string; timestamp: number };
  }
}

// Handle in convertToLlm
const agent = new Agent({
  convertToLlm: (messages) => messages.flatMap(m => {
    if (m.role === "my-custom") return [];  // Filter out
    return [m];
  }),
});
```

---

### 2. Option B — SDK `createAgentSession()`

**Package**: `@mariozechner/pi-coding-agent`
**Source**: `packages/coding-agent/src/core/sdk.ts`

#### What it is

A high-level factory function that creates a fully configured `AgentSession` with all the infrastructure needed for a production coding agent: session persistence, auth management, model registry, extensions, skills, compaction, bash execution, and more.

#### Constructor

```typescript
import { createAgentSession } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";

const { session, extensionsResult, modelFallbackMessage } = await createAgentSession({
  // Working directory (default: process.cwd())
  cwd: "/path/to/project",

  // Global config directory (default: ~/.pi/agent)
  agentDir: "~/.pi/agent",

  // Model to use (default: from settings or first available)
  model: getModel("anthropic", "claude-sonnet-4-5"),
  thinkingLevel: "medium",

  // Built-in tools (default: codingTools = [read, bash, edit, write])
  tools: undefined,  // or specify: [readTool, bashTool]

  // Custom tools to register (in addition to built-in)
  customTools: [myCustomTool],

  // Resource loader (default: DefaultResourceLoader)
  resourceLoader: undefined,

  // Session manager (default: SessionManager.create(cwd))
  sessionManager: undefined,

  // Settings manager (default: SettingsManager.create(cwd, agentDir))
  settingsManager: undefined,
});

// AgentSession wraps Agent and adds:
session.agent;           // The underlying Agent instance
session.messages;        // Current conversation messages
session.subscribe(...);  // Subscribe to events (same as Agent)
session.prompt(text);    // Send a prompt
session.abort();         // Cancel current run
session.compact();       // Manually compact context
session.switchModel(...); // Change model mid-session
session.getSlashCommands(); // Get available slash commands
```

#### Built-in Tools

| Tool Name | Description | Default Active |
|-----------|-------------|----------------|
| `read` | Read file contents | ✅ Yes |
| `bash` | Execute shell commands | ✅ Yes |
| `edit` | Surgical file edits (search-and-replace) | ✅ Yes |
| `write` | Write/create files | ✅ Yes |
| `grep` | Search file contents with regex | ❌ No |
| `find` | Find files by glob pattern | ❌ No |
| `ls` | List directory contents | ❌ No |

Available via `codingTools` (default), `readOnlyTools`, or `allBuiltInTools`.

#### Extensions System

Extensions are TypeScript modules loaded from `~/.pi/agent/extensions/` or `.pi/extensions/` that can:

- Subscribe to agent lifecycle events
- Register LLM-callable tools (`ToolDefinition`)
- Register slash commands and keyboard shortcuts
- Modify context before LLM calls (`transformContext`)
- Intercept LLM requests/responses (`before_provider_request`, `after_provider_response`)
- Interact with the user via UI primitives (in interactive mode)

```typescript
// Extension interface (simplified)
interface ExtensionFactory {
  (context: ExtensionContext): Extension;
}

interface Extension {
  name: string;
  tools?: ToolDefinition[];
  slashCommands?: SlashCommandDefinition[];
  eventHandlers?: Record<string, EventHandler>;
  // ... more hooks
}
```

#### Skills System

Skills are markdown instruction files (`SKILL.md`) that modify agent behavior:

```
~/.pi/agent/skills/              # Global skills
.pi/skills/                       # Project-local skills

# Each skill is a directory with SKILL.md:
~/.pi/agent/skills/my-skill/
  SKILL.md    # Instructions (with YAML frontmatter)
  script.sh   # Optional: scripts referenced by skill
```

```markdown
---
name: my-skill
description: Does something specialized
---

# My Skill

Instructions for the agent...
Scripts are in: {baseDir}/
```

Skills are auto-discovered, validated (name must match directory, must have description), and injected into the system prompt as `<available_skills>` XML. The agent can `read` the skill file when it needs the instructions.

#### Compaction

When the context window fills up, the SDK automatically compacts (summarizes) old messages to make room for new ones. This is handled by `packages/coding-agent/src/core/compaction/`.

---

### 3. Option C — MOM Agent

**Package**: `@mariozechner/pi-mom`
**Source**: `packages/mom/src/agent.ts`

#### What it is

A concrete implementation of a chat bot agent designed for Slack (and soon Discord). It uses `Agent` from `pi-agent-core` and `AgentSession` from `pi-coding-agent`, wrapping them in a platform adapter pattern.

#### Architecture

```
Platform Adapter (Slack/Discord/CLI)
        ↓ ChannelMessage
    MomAgent (AgentSession wrapper)
        ↓ events
    Platform Adapter renders response
```

#### Key Pattern: One Agent Per Channel

```typescript
// From packages/mom/src/agent.ts
const channelRunners = new Map<string, AgentRunner>();

export function getOrCreateRunner(sandboxConfig, channelId, channelDir): AgentRunner {
  const existing = channelRunners.get(channelId);
  if (existing) return existing;

  const runner = createRunner(sandboxConfig, channelId, channelDir);
  channelRunners.set(channelId, runner);
  return runner;
}

function createRunner(sandboxConfig, channelId, channelDir): AgentRunner {
  // Each runner gets:
  // - Its own Agent instance
  // - Its own system prompt
  // - Its own tools (bash, read, write, edit, attach)
  // - Its own session/context (context.jsonl)
  // - Its own memory (MEMORY.md)
  // - Its own skills
  // - Its own sandbox (Docker container)

  const agent = new Agent({
    initialState: {
      systemPrompt: buildSystemPrompt(...),
      model: getModel("anthropic", "claude-sonnet-4-5"),
      thinkingLevel: "off",
      tools: createMomTools(executor),
    },
    convertToLlm,
    getApiKey: async () => getAnthropicApiKey(authStorage),
  });

  // Wrap in AgentSession for persistence
  const session = new AgentSession({
    agent, sessionManager, settingsManager,
    cwd: process.cwd(), modelRegistry, resourceLoader,
  });

  return { run, abort };
}
```

#### Key Insight: Agents Are Isolated

- Each channel gets its own agent instance
- Agents do NOT communicate with each other
- They share only: filesystem (workspace), skills directory, and global MEMORY.md
- This is "multi-agent" in deployment only — not in coordination

---

### 4. Agent Team Patterns

#### Pattern X: Channel-Per-Agent Isolation (MOM Pattern)

**How it works**: Create one agent per task/channel/conversation. Each agent is independent.

**Implementation**:
```typescript
const agents = new Map<string, Agent>();

function getAgentForTask(taskId: string): Agent {
  if (!agents.has(taskId)) {
    agents.set(taskId, new Agent({
      initialState: {
        systemPrompt: `You are agent for task ${taskId}...`,
        model: getModel("anthropic", "claude-sonnet-4-5"),
        tools: [...],
      },
      convertToLlm,
    }));
  }
  return agents.get(taskId)!;
}
```

**Pros**: Simple, fault-isolated, horizontally scalable
**Cons**: No coordination, no shared context between agents

#### Pattern Y: Manual Multi-Agent Orchestration

**How it works**: Create multiple specialized agents and an orchestrator that delegates tasks.

**Implementation**:
```typescript
// Specialized agents
const codeAgent = new Agent({
  initialState: {
    systemPrompt: "You write code. You are given a task and return the implementation.",
    model: getModel("anthropic", "claude-sonnet-4-5"),
    tools: [readTool, editTool, bashTool],
  },
  convertToLlm,
});

const reviewAgent = new Agent({
  initialState: {
    systemPrompt: "You review code for bugs, security issues, and best practices.",
    model: getModel("anthropic", "claude-sonnet-4-5"),
    tools: [readTool],
  },
  convertToLlm,
});

const orchestrator = new Agent({
  initialState: {
    systemPrompt: "You are a team lead. You delegate tasks to specialists.",
    model: getModel("anthropic", "claude-sonnet-4-5"),
    tools: [
      delegateToCodeAgentTool,
      delegateToReviewAgentTool,
    ],
  },
  convertToLlm,
});

// The delegate tools would:
// 1. Call codeAgent.prompt(task)
// 2. Wait for completion
// 3. Return the result to the orchestrator
```

**Pros**: Full control, coordinated, specialized agents
**Cons**: Must build orchestration layer, manage agent lifecycle, handle errors

#### Pattern Z: Single Agent + Skills/Extensions

**How it works**: One agent with skills that define different "roles" or behaviors.

**Implementation**: Use the skills system to load different behavior sets based on the task.

```markdown
# ~/.pi/agent/skills/researcher/SKILL.md
---
name: researcher
description: Use when researching topics
---

# Researcher Mode
Focus on finding and analyzing information. Be thorough but concise.
```

```markdown
# ~/.pi/agent/skills/implementer/SKILL.md
---
name: implementer
description: Use when writing code
---

# Implementer Mode
Focus on writing clean, working code. Follow existing patterns.
```

The agent reads the appropriate skill file when the task matches its description.

**Pros**: Simple, no extra infrastructure, leverages existing system
**Cons**: Not true multi-agent, single model bottleneck, sequential processing

---

## Trade-off Analysis

### Agent Creation

| | Agent class (Option A) | createAgentSession (Option B) | MOM Agent (Option C) |
|--|----------------------|-------------------------------|---------------------|
| **Gains** | Full control, minimal dependencies, no magic | Session persistence, auth, extensions, skills out of the box | Platform integration, sandbox, events system |
| **Loses** | Must build everything yourself | Less control over internals | Tightly coupled to chat platform pattern |
| **Best for** | Custom agent apps, research, non-coding agents | Production coding agents, CLI tools | Chat bots, automated assistants |
| **Avoid if** | You need persistence, auth, or extensions | You need low-level control over the agent loop | You're not building a chat bot |

### Agent Teams

| | Channel isolation (X) | Manual orchestration (Y) | Skills/role switching (Z) |
|--|----------------------|--------------------------|---------------------------|
| **Gains** | Simple, proven (MOM), fault-isolated | True coordination, specialization | Simplest, no extra code |
| **Loses** | No inter-agent communication | Complex to build and maintain | Not real multi-agent, sequential |
| **Best for** | Independent parallel tasks | Complex workflows needing coordination | Simple projects with varied task types |
| **Avoid if** | Agents need to share context or coordinate | Team size is small or tasks are simple | Tasks are complex enough to need real specialization |

---

## Recommendation

### For Creating Individual Agents

> **Use Option B (`createAgentSession()`) for production coding agents. Use Option A (raw `Agent`) for custom non-coding agent applications.**

**Justification**:
1. `createAgentSession()` provides session persistence, auth, model registry, extensions, skills, and compaction — all the infrastructure you'd otherwise build yourself
2. The raw `Agent` class is the right choice when you don't need the coding-agent ecosystem (e.g., building a data analysis agent, a research agent, or a custom tool)
3. MOM is only relevant if you're building a chat bot for Slack/Discord

### For Creating Agent Teams

> **There is no built-in agent team framework. Build your own using Option Y (manual orchestration) if you need true coordination, or Option X (channel isolation) if tasks are independent.**

**Justification**:
1. pi-coding-agent is architecturally single-agent — this is by design, not an oversight
2. The `Agent` class is lightweight enough to instantiate multiple times
3. The event system (`subscribe()`) provides the hooks needed for orchestration
4. `steer()` and `followUp()` allow external coordination of agent behavior
5. The MOM package proves the pattern works for isolated agents at scale

**Practical guidance for building an agent team**:
1. Create an orchestrator agent that understands task decomposition
2. Define delegate tools that spawn sub-agents for specific tasks
3. Use `steer()` to inject results from sub-agents back into the orchestrator
4. Use the filesystem or a shared message queue for inter-agent state
5. Consider using `createAgentSession()` for each sub-agent to get persistence

---

## Migration / Adoption Path

### Creating Your First Agent

> Estimated effort: 1-2 hours
> Risk: Low

- [ ] Step 1: Install `@mariozechner/pi-agent-core` and `@mariozechner/pi-ai`
- [ ] Step 2: Define your tools using `Type.Object()` schemas from `@sinclair/typebox`
- [ ] Step 3: Create an `Agent` instance with system prompt, model, and tools
- [ ] Step 4: Subscribe to events for streaming output
- [ ] Step 5: Call `agent.prompt("your task")` and handle the response
- [ ] Step 6: Test with `agent.continue()` for multi-turn conversations

### Creating a Production Agent with SDK

> Estimated effort: 2-4 hours
> Risk: Low

- [ ] Step 1: Install `@mariozechner/pi-coding-agent`
- [ ] Step 2: Set up auth (API keys in environment or `auth.json`)
- [ ] Step 3: Call `createAgentSession({ model, tools, cwd })` 
- [ ] Step 4: Use `session.prompt()` for interaction
- [ ] Step 5: Add skills in `~/.pi/agent/skills/` for specialized behaviors
- [ ] Step 6: Add extensions for custom tools and event handling

### Building an Agent Team

> Estimated effort: 1-2 weeks
> Risk: Medium

- [ ] Step 1: Define your team structure (orchestrator + specialists)
- [ ] Step 2: Create specialized agents with role-specific system prompts and tools
- [ ] Step 3: Build delegate tools that call `subAgent.prompt()` and return results
- [ ] Step 4: Implement the orchestrator agent with delegate tools
- [ ] Step 5: Add error handling and timeout management for sub-agents
- [ ] Step 6: Implement shared state management (filesystem, message queue, or in-memory)
- [ ] Step 7: Test with a simple two-agent workflow (e.g., code + review)
- [ ] Step 8: Add logging and observability for multi-agent interactions

---

## Open Questions

- [ ] Should agent teams share a single `AgentSession` or each have their own? [Opinion: Own session per agent for isolation, shared filesystem for state]
- [ ] What is the maximum practical number of concurrent `Agent` instances? [Unknown: depends on API rate limits and available API keys]
- [ ] Can the extension system be used to implement multi-agent orchestration as a plugin? [Possible but not demonstrated — would need to spawn Agent instances from within an extension]
- [ ] Is there a plan to add built-in multi-agent support to pi-coding-agent? [Unknown: no issues or discussions found on this topic]
- [ ] How does `transformContext` interact with multi-agent message passing? [Needs testing — messages from other agents would need to be converted properly]

---

## References

| Source | URL | Date accessed |
|--------|-----|---------------|
| pi-agent-core README | https://github.com/badlogic/pi-mono/blob/master/packages/agent/README.md | 2026-04-19 |
| Agent class source | `packages/agent/src/agent.ts` in badlogic/pi-mono | 2026-04-19 |
| Agent types source | `packages/agent/src/types.ts` in badlogic/pi-mono | 2026-04-19 |
| SDK source | `packages/coding-agent/src/core/sdk.ts` in badlogic/pi-mono | 2026-04-19 |
| AgentSession source | `packages/coding-agent/src/core/agent-session.ts` in badlogic/pi-mono | 2026-04-19 |
| Skills source | `packages/coding-agent/src/core/skills.ts` in badlogic/pi-mono | 2026-04-19 |
| MOM agent source | `packages/mom/src/agent.ts` in badlogic/pi-mono | 2026-04-19 |
| MOM redesign docs | `packages/mom/docs/new.md` in badlogic/pi-mono | 2026-04-19 |
| AGENTS.md (dev rules) | https://github.com/badlogic/pi-mono/blob/master/AGENTS.md | 2026-04-19 |
| Proxy source | `packages/agent/src/proxy.ts` in badlogic/pi-mono | 2026-04-19 |
| zread docs — overview | https://zread.ai/badlogic/pi-mono/1-overview | 2026-04-19 |
| zread docs — agent loop | https://zread.ai/badlogic/pi-mono/10-agent-loop-and-state-machine | 2026-04-19 |
| zread docs — AgentSession lifecycle | https://zread.ai/badlogic/pi-mono/12-agentsession-lifecycle | 2026-04-19 |
| pi-coding-agent npm | https://www.npmjs.com/package/@mariozechner/pi-coding-agent | 2026-04-19 |
