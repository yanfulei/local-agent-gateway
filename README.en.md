# Local Agent Gateway

[English](./README.en.md) | [简体中文](./README.zh-CN.md)

Local Agent Gateway exposes local agent sessions running on your own computer to chat platforms. The MVP targets macOS, Feishu/Lark long-connection bots, and Codex CLI app-server/remote-control. The product model is environment-first: the selected environment defines the current resource scope, while providers and channels stay behind that boundary. It is local-first: the HTTP service binds to `127.0.0.1`, and all gateway data is stored under `~/.local-agent-gateway`.

## Features

- Local Web UI for environment switching, environment-scoped sessions, session-to-channel-bot binding, Feishu bot configuration, chat, task queue, logs, and task approvals.
- Environments are the top-level operating scope. An environment owns its default cwd, provider choice, local agent sessions, tasks, logs, and visible bindings.
- Local agent sessions are the core working object inside an environment. A session belongs to one provider, for example `codex:<native-session-id>`.
- Provider layer adapts the gateway to local agent session systems. Codex is the only implemented provider in the MVP, but providers now have their own management page, capability declarations, and API update path for future Claude Code, OpenClaw, Hermes, or ACP-style adapters.
- Channel layer is explicit. Feishu/Lark is the only implemented channel in the MVP, but the backend now isolates channel runtime through a Channel Adapter/Registry, and bot configs and tasks carry channel identity.
- Multiple Feishu bots. Each bot has independent App ID, App Secret, Verification Token, Encrypt Key, allowlisted open IDs/chat IDs, output mode, running-message mode, and an explicit active route: `environmentId + sessionKey`.
- One channel bot can bind one active environment/session route; one session can be bound by multiple channel bots. The Web UI's current environment is only view state and never implicitly reroutes incoming Feishu messages.
- Feishu long-connection receiving through `WSClient`; a public webhook URL is not required for message events or supported card callbacks.
- Feishu Card JSON 2.0 task cards with status headers, environment/session tags, source-message context, approval buttons, log button, retry button, and cancel button.
- Feishu task logs are sent as a compact V2 preview card plus full Markdown (`.md`) log files.
- Text replies of `同意` / `拒绝` also resolve pending approvals for that bot/thread.
- Feishu image and file messages are downloaded through `im.v1.messageResource.get` and passed to Codex as local attachments.
- Web UI file upload passes local attachments to Codex; task attachment folders are cleaned up after Codex consumes them.
- Codex sessions are listed from `codex app-server thread/list`, with `~/.codex/sessions` and `~/.codex/session_index.jsonl` scanning retained as a local fallback.
- Gateway-created sessions are backed by Codex app-server thread IDs and can be bound to bots.
- Task execution uses `codex app-server --listen stdio://` JSON-RPC `thread/start`, `thread/resume`, `turn/start`, and `turn/interrupt`. The MVP only implements the stdio transport; `ws://` and `unix://` should be enabled later through dedicated transports.
- Codex status events are translated into gateway task states: thinking, running command, generating diff, waiting approval, completed, failed, and cancelled.
- Raw Codex app-server notifications are written to per-task log files while structured status is streamed to the Web UI and Feishu cards.

## Architecture

```text
Local agent session
  -> Provider Adapter (Codex MVP)
  -> Gateway Core (environment, routing, queue, logs, approvals, attachments)
  -> Channel Adapter (Feishu/Lark MVP)
  -> IM bot
```

Code boundaries:

- `src/shared`: business types shared by the Web UI and server.
- `src/server/providers`: provider abstraction, session keys, and registry.
- `src/server/codex`: Codex provider for session discovery, history, task execution, and approval forwarding.
- `src/server/channels`: channel adapter and registry for dispatching task state to messaging platforms.
- `src/server/feishu`: Feishu long-connection runtime, attachment download, card actions, and Card V2 rendering.
- `src/web`: local console for configuration, display, chat, and operator actions. It does not execute agent logic directly.

The useful pattern borrowed from cc-connect is capability-oriented Agent/Platform interfaces, Web-based management, and an ACP extension path. Slash commands, cron, relay, and system-prompt injection are intentionally not included in the MVP because Local Agent Gateway is a router/manager for local agent sessions, not an agent layer.

Compared with cc-connect's Codex integration, this project keeps two aligned ideas: prefer Codex app-server/remote-control for real Codex sessions, and retain `codex exec --json resume` as a fallback execution path. The differences are intentional: this gateway does not inject system prompts, does not modify original Codex session files, and does not manage model-provider configuration for the user.

## Run

```bash
npm install
npm run build
npm start
```

Open http://127.0.0.1:3030.

For development:

```bash
npm run dev
```

The API listens on http://127.0.0.1:3030. The Vite dev UI listens on http://127.0.0.1:5173.

## Feishu/Lark Setup

Enable these capabilities and permissions for the self-built app:

- Bot capability.
- Event subscription for `im.message.receive_v1`.
- Card callback/event delivery for `card.action.trigger` for card buttons.
- Send messages and update interactive message cards.
- Upload files for Markdown task logs.
- Read/download message resources for images and files.

In Feishu Developer Console, use long connection mode for event subscription and subscribe to the receive-message event (`im.message.receive_v1`). For card buttons, use long connection mode in callback configuration and enable card action callback (`card.action.trigger`) when available. The gateway also exposes `POST /webhook/card/:botId` as an HTTP fallback for card actions if you later put the local service behind a tunnel.

Create a bot in the Web UI with App ID and App Secret. Add Verification Token and Encrypt Key from the app's event/callback settings if enabled. Leave allowlists empty for personal all-user/all-chat MVP behavior, or fill comma-separated open IDs and chat IDs to restrict input. Bind the bot from the local agent session list; that stores the active `environmentId + sessionKey` route for Feishu messages.

## Product Model

- Global: server host/port, data directory, default working directory, and other reusable defaults.
- Environment: provider selection, default working directory, enabled/default flags, and the scoped view of sessions, tasks, logs, and bindings.
- Provider: local agent adapter configuration, command, connection mode, and capability declaration. The Codex provider currently supports session listing, session creation, history, message sending, attachment input, cancellation, approvals, app-server, and exec fallback.
- Session: provider-native local agent conversation/thread. The gateway discovers it, displays history, sends instructions, and records routing metadata.
- Channel bot: Feishu/Lark credentials and delivery policy. A bot is globally configured but its active route points to one environment/session pair.

## Codex

Verified locally with `codex-cli 0.130.0`.

The gateway reads the existing local Codex configuration and does not replace your Codex approval/sandbox settings. When Codex emits app-server approval requests, the gateway shows them in the Web UI and Feishu card and sends the user's decision back to Codex.

## Data

Local data lives under `~/.local-agent-gateway`:

- `config.json`: global settings, provider configs, environments, bot credentials, explicit environment/session bindings, and allowlists.
- `state.json`: gateway-created session overlays.
- `attachments/`: temporary Feishu/Web UI attachments during active tasks.
- `logs/`: raw per-task Codex app-server output logs.
- `runtime/`: runtime scratch directory.

MVP stores Feishu credentials in plaintext local JSON, matching the personal local-use scope. Do not commit files from `~/.local-agent-gateway`; they may contain bot credentials, task logs, and local attachment cache.

During development, deleting `~/.local-agent-gateway` is an acceptable way to reset gateway configuration and state. `~/.codex` is the original Codex data source. The gateway only reads Codex history and creates/resumes sessions through Codex app-server/CLI; it must not directly delete, rewrite, or migrate original session files under `~/.codex`.

## Maintainers

- codex

## Contributors

- codex

## Verification

```bash
npm run typecheck
npm run build
npm audit --audit-level=moderate
```

API smoke tested:

- `GET /api/state`
- `POST /api/environments/:environmentId/sessions/refresh`
- `GET /api/environments/:environmentId/sessions/:sessionKey/messages`

Browser smoke tested against http://127.0.0.1:3030.
