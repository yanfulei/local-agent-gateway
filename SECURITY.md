# Security Policy / 安全策略

[English](#english) | [简体中文](#简体中文)

## English

Local Agent Gateway is a local-first MVP. It is intended to bind to `127.0.0.1` and proxy your own local agent sessions to explicitly configured chat bots.

### Supported Versions

Only the latest `main` branch is supported during the MVP phase.

### Reporting a Vulnerability

Please do not open public issues containing secrets, tokens, chat IDs, task logs, local paths, or screenshots with credentials. Report privately to the project maintainer when a private channel is available.

### Local Secrets

The MVP stores Feishu/Lark app credentials in plaintext under `~/.local-agent-gateway/config.json`. Keep this directory out of source control and avoid exposing the local HTTP service to untrusted networks.

## 简体中文

Local Agent Gateway 是本地优先的 MVP。它默认只监听 `127.0.0.1`，用于把你自己的本地智能体会话代理给显式配置过的聊天机器人。

### 支持版本

MVP 阶段仅支持最新 `main` 分支。

### 报告漏洞

请不要在公开 issue 中粘贴密钥、token、chat ID、任务日志、本地路径，或包含凭证的截图。有私密联系渠道时，请优先私下报告给项目维护者。

### 本地密钥

MVP 会把飞书/Lark 应用凭证以明文形式存储在 `~/.local-agent-gateway/config.json`。请确保该目录不进入源码仓库，也不要把本地 HTTP 服务暴露给不可信网络。

