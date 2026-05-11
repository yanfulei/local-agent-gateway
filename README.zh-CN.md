# Local Agent Gateway

[English](./README.en.md) | [简体中文](./README.zh-CN.md)

Local Agent Gateway 是一个本地优先的智能体网关，用来把你电脑上的本地编程智能体会话代理到飞书等即时通讯渠道。当前 MVP 面向 macOS、飞书长连接机器人和 Codex CLI app-server/remote-control。本项目的产品模型以“环境”为操作边界：当前环境决定资源范围，provider 和渠道都在环境边界内工作。HTTP 服务默认只监听 `127.0.0.1`，网关数据存储在 `~/.local-agent-gateway`。

## 功能

- 本地 Web UI：环境切换、环境内会话、会话绑定渠道机器人、飞书机器人配置、聊天、任务队列、运行日志和审批操作。
- 环境是顶层操作范围。环境拥有默认工作目录、provider 选择、本地智能体会话、任务、日志和可见绑定关系。
- 本地智能体会话是环境内的核心对象。一个会话属于一个 provider，例如 `codex:<native-session-id>`。
- Provider 层是环境的实现细节。MVP 只实现 Codex，但任务、日志、会话和绑定都已经携带环境与 provider 身份，方便后续扩展。
- 渠道层显式建模。MVP 只实现飞书/Lark，但机器人配置和任务都携带渠道身份。
- 支持多个飞书机器人。每个机器人有独立 App ID、App Secret、Verification Token、Encrypt Key、open ID/chat ID 白名单、输出模式、运行消息模式，以及明确的活跃路由：`environmentId + sessionKey`。
- 一个渠道机器人只能绑定一个活跃环境/会话路由；一个会话可以被多个渠道机器人绑定。Web UI 当前选中的环境只是视图状态，不会隐式改变飞书消息路由。
- 飞书消息通过 `WSClient` 长连接接收；消息事件和已支持的卡片回调不需要公网 webhook 地址。
- 飞书 Card JSON 2.0 任务卡片：状态 Header、环境/会话标签、原始消息上下文、审批按钮、日志按钮、重试按钮和取消按钮。
- 飞书任务日志会发送一张简洁的 V2 预览卡片，并附带完整 Markdown (`.md`) 日志文件。
- 回复 `同意` / `拒绝` 可以处理该机器人/线程中等待中的 Codex 审批。
- 飞书图片和普通文件会通过 `im.v1.messageResource.get` 下载，并作为本地附件传给 Codex。
- Web UI 文件上传会作为本地附件传给 Codex；任务附件目录会在 Codex 消费后自动清理。
- Codex 会话优先来自 `codex app-server thread/list`，并保留 `~/.codex/sessions` 与 `~/.codex/session_index.jsonl` 的本地扫描兜底。
- 网关创建的会话基于 Codex app-server thread ID，可直接绑定机器人。
- 任务执行使用 `codex app-server --listen stdio://` 的 JSON-RPC：`thread/start`、`thread/resume`、`turn/start`、`turn/interrupt`。
- Codex 状态事件会被转换为网关任务状态：思考中、运行命令、生成 diff、等待审批、已完成、失败、已取消。
- 原始 Codex app-server 通知写入单任务日志文件，结构化状态同步展示到 Web UI 和飞书卡片。

## 运行

```bash
npm install
npm run build
npm start
```

打开 http://127.0.0.1:3030。

开发模式：

```bash
npm run dev
```

API 服务监听 http://127.0.0.1:3030。Vite 开发 UI 监听 http://127.0.0.1:5173。

## 飞书配置

在飞书开放平台的自建应用中启用这些能力和权限：

- 机器人能力。
- 订阅 `im.message.receive_v1` 消息事件。
- 为卡片按钮启用 `card.action.trigger` 卡片回调/事件。
- 发送消息和更新交互式消息卡片。
- 上传文件，用于发送 Markdown 任务日志。
- 读取/下载消息资源，用于接收图片和普通文件。

事件订阅建议使用长连接模式，并订阅接收消息事件 `im.message.receive_v1`。卡片按钮建议在回调配置中使用长连接模式，并在可用时启用卡片动作回调 `card.action.trigger`。网关同时提供 `POST /webhook/card/:botId` 作为 HTTP 回调兜底，如果后续你把本地服务放到隧道后面，可以使用它接收卡片动作。

在 Web UI 中创建机器人，填写 App ID 和 App Secret。如果应用事件/回调设置启用了 Verification Token 和 Encrypt Key，也一并填写。白名单留空表示个人 MVP 场景下允许所有用户/群；也可以填写逗号分隔的 open ID 和 chat ID 限制输入来源。然后在本地智能体会话列表中绑定机器人，网关会保存该机器人的活跃 `environmentId + sessionKey` 路由。

## 产品模型

- 全局：服务 host/port、数据目录、Codex 命令、app-server 模式和其他可复用默认值。
- 环境：provider 选择、默认工作目录、启用/默认状态，以及环境内的会话、任务、日志和绑定视图。
- 会话：provider 原生的本地智能体 conversation/thread。网关负责发现、展示历史、发送指令和记录路由元数据。
- 渠道机器人：飞书/Lark 凭证和投递策略。机器人是全局配置，但活跃路由指向一个环境/会话。

## Codex

本地已使用 `codex-cli 0.130.0` 验证。

网关读取现有本地 Codex 配置，不替代你的 Codex 审批和沙箱设置。当 Codex app-server 发出审批请求时，网关会在 Web UI 和飞书卡片中展示，并把用户决策发送回 Codex。

## 数据

本地数据位于 `~/.local-agent-gateway`：

- `config.json`：全局设置、环境、机器人凭证、显式环境/会话绑定、白名单和 Codex 命令设置。
- `state.json`：网关创建的会话叠加状态。
- `attachments/`：活跃任务期间的飞书/Web UI 临时附件。
- `logs/`：单任务原始 Codex app-server 输出日志。
- `runtime/`：运行时临时目录。

MVP 按个人本地使用范围设计，飞书凭证以明文 JSON 存储在本机。不要提交 `~/.local-agent-gateway` 下的任何文件；其中可能包含机器人凭证、任务日志和本地附件缓存。

## 维护者

- codex

## 验证

```bash
npm run typecheck
npm run build
npm audit --audit-level=moderate
```

API 冒烟验证：

- `GET /api/state`
- `POST /api/environments/:environmentId/sessions/refresh`
- `GET /api/environments/:environmentId/sessions/:sessionKey/messages`

浏览器冒烟验证地址：http://127.0.0.1:3030。

