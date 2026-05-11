# Contributing / 贡献指南

[English](#english) | [简体中文](#简体中文)

## English

Local Agent Gateway is in MVP stage. Keep changes small, local-first, and aligned with the core model:

- Environment: the current resource boundary.
- Provider: adapter for a local agent session system.
- Session: the primary working object.
- Channel bot: route from an IM platform to one environment/session pair.

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
- Keep provider-specific code below `src/server/codex` or a future provider folder.
- Keep channel-specific code below `src/server/feishu` or a future channel folder.

## 简体中文

Local Agent Gateway 当前处于 MVP 阶段。贡献时请保持改动小而清晰，优先本地优先的使用方式，并遵循核心模型：

- 环境：当前资源边界。
- Provider：本地智能体会话系统的适配器。
- 会话：主要工作对象。
- 渠道机器人：从即时通讯平台路由到一个环境/会话。

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
- Provider 相关代码放在 `src/server/codex` 或未来的 provider 目录下。
- 渠道相关代码放在 `src/server/feishu` 或未来的 channel 目录下。

