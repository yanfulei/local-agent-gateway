# Release Checklist / 发布检查清单

[English](#english) | [简体中文](#简体中文)

## English

- Run `npm ci`.
- Run `npm run typecheck`.
- Run `npm run build`.
- Run `npm audit --audit-level=moderate`.
- Run `npm pack --dry-run` and verify the package contains only source, docs, and config files.
- Search for secrets before pushing: app secrets, tokens, private keys, logs, local attachment files, and screenshots.
- Never commit `~/.local-agent-gateway`, `.env`, `dist`, `node_modules`, or task logs.

## 简体中文

- 运行 `npm ci`。
- 运行 `npm run typecheck`。
- 运行 `npm run build`。
- 运行 `npm audit --audit-level=moderate`。
- 运行 `npm pack --dry-run`，确认包内只包含源码、文档和配置文件。
- 推送前搜索敏感信息：app secret、token、私钥、日志、本地附件和截图。
- 不要提交 `~/.local-agent-gateway`、`.env`、`dist`、`node_modules` 或任务日志。

