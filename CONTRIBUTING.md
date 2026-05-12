# Contributing / 贡献指南

[English](#english) | [简体中文](#简体中文)

## English

Local Agent Gateway is in MVP stage. Keep changes small, local-first, and aligned with the core model:

- Environment: the current resource boundary.
- Provider: adapter for a local agent session system.
- Session: the primary working object.
- Channel bot: route from an IM platform to one environment/session pair.
- Gateway core: routing, queueing, logs, approvals, attachments, and Web UI. It must not become an LLM or agent runtime.

### Development

```bash
npm install
npm run typecheck
npm run build
npm start
```

Open http://127.0.0.1:3030.

### Pull Request Checklist

- Run `npm run typecheck`.
- Run `npm run build`.
- Do not commit `~/.local-agent-gateway`, `.env`, logs, screenshots with secrets, or local attachments.
- Gateway state under `~/.local-agent-gateway` may be reset during development, but original agent data such as `~/.codex` must be treated as read-only unless the user explicitly asks and the operation goes through the agent's own CLI/API.
- Keep provider abstractions in `src/server/providers`; put provider implementations under `src/server/codex` or a future provider folder.
- Keep channel abstractions in `src/server/channels`; put channel implementations under `src/server/feishu` or a future channel folder.
- Keep channel card rendering separate from channel runtime when the rendering logic grows.

## 简体中文

Local Agent Gateway 当前处于 MVP 阶段。贡献时请保持改动小而清晰，优先本地优先的使用方式，并遵循核心模型：

- 环境：当前资源边界。
- Provider：本地智能体会话系统的适配器。
- 会话：主要工作对象。
- 渠道机器人：从即时通讯平台路由到一个环境/会话。
- 网关核心：路由、队列、日志、审批、附件和 Web UI。网关不应变成大模型或智能体运行时。

### 开发

```bash
npm install
npm run typecheck
npm run build
npm start
```

打开 http://127.0.0.1:3030。

### PR 检查清单

- 运行 `npm run typecheck`。
- 运行 `npm run build`。
- 不要提交 `~/.local-agent-gateway`、`.env`、日志、包含密钥的截图或本地附件。
- 开发时可以重置 `~/.local-agent-gateway` 网关状态，但 `~/.codex` 等原始智能体数据必须视为只读；除非用户明确要求，并且操作通过智能体自身 CLI/API 完成，否则不要直接删除或改写。
- Provider 抽象放在 `src/server/providers`；Provider 实现放在 `src/server/codex` 或未来的 provider 目录下。
- 渠道抽象放在 `src/server/channels`；渠道实现放在 `src/server/feishu` 或未来的 channel 目录下。
- 渠道卡片渲染逻辑变复杂时，应和渠道运行时分开维护。
