import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import type {
  BotStatus,
  ChannelType,
  CodexThreadStatus,
  CodexThreadMessage,
  CodexThreadSummary,
  DashboardState,
  EnvironmentConfig,
  FeishuBotConfig,
  GatewayEvent,
  GatewayTask,
  AttachmentInput,
  TaskStatus
} from "../shared/types.js";
import "./styles.css";

type Locale = "zh" | "en";

type Translations = {
  documentTitle: string;
  languageAria: string;
  languageZh: string;
  languageEn: string;
  brandTitle: string;
  brandSubtitle: string;
  environment: string;
  environmentOverview: string;
  environmentSettings: string;
  globalSettings: string;
  createEnvironment: string;
  createEnvironmentDescription: string;
  addEnvironment: string;
  saveEnvironment: string;
  environmentCount: string;
  currentEnvironmentLabel: string;
  environmentObjects: string;
  boundRouteLabel: string;
  gatewaySettings: string;
  feishuBots: string;
  channelOutputs: string;
  pageDescriptions: Record<"tasks" | "logs" | "bots" | "settings", string>;
  threadsTitle: string;
  threadsSubtitle: string;
  refresh: string;
  chatTitle: string;
  selectOrCreateThread: string;
  selectedThreadBinding: string;
  selectedSessionBindings: string;
  loadingHistory: string;
  expandChat: string;
  close: string;
  userLabel: string;
  agentLabel: string;
  imageAttachment: string;
  imageAlt: string;
  fileAttachment: string;
  taskQueue: string;
  logsTitle: string;
  logDetailTitle: string;
  botConfigSummary: string;
  dangerZoneTitle: string;
  dangerZoneDescription: string;
  emptyTasksTitle: string;
  emptyTasksDescription: string;
  confirmDeleteBot: string;
  confirmDeleteEnvironment: string;
  threadCount: string;
  activeThreadLabel: string;
  noSelection: string;
  workdirLabel: string;
  providerLabel: string;
  providerTypeLabel: string;
  channelLabel: string;
  channelBotLabel: string;
  lastActivityLabel: string;
  copiedThreadId: string;
  fields: Record<
    | "dataDir"
    | "environmentName"
    | "environmentDescription"
    | "environmentProvider"
    | "environmentDefaultCwd"
    | "environmentEnabled"
    | "environmentDefault"
    | "defaultCwd"
    | "codexCommand"
    | "appServerListen"
    | "preferAppServer"
    | "name"
    | "channel"
    | "appId"
    | "appSecret"
    | "verificationToken"
    | "encryptKey"
    | "allowedOpenIds"
    | "allowedChatIds"
    | "activeThread"
    | "runningMessages"
    | "outputMode"
    | "enabled"
    | "title"
    | "workingDirectory"
    | "bindToBot"
    | "threadBinding"
    | "threadSearch"
    | "attachments",
    string
  >;
  help: Record<
    | "dataDir"
    | "environmentName"
    | "environmentDescription"
    | "environmentProvider"
    | "environmentDefaultCwd"
    | "environmentEnabled"
    | "environmentDefault"
    | "defaultCwd"
    | "codexCommand"
    | "appServerListen"
    | "preferAppServer"
    | "name"
    | "channel"
    | "appId"
    | "appSecret"
    | "verificationToken"
    | "encryptKey"
    | "allowedOpenIds"
    | "allowedChatIds"
    | "activeThread"
    | "runningMessages"
    | "outputMode"
    | "enabled"
    | "title"
    | "workingDirectory"
    | "bindToBot"
    | "threadBinding"
    | "attachments",
    string
  >;
  placeholders: Record<
    "defaultCwd" | "environmentDescription" | "allowedUsers" | "allowedChats" | "useDefaultCwd" | "instruction" | "threadSearch",
    string
  >;
  actions: Record<
    | "saveSettings"
    | "switchEnvironment"
    | "saveEnvironment"
    | "deleteEnvironment"
    | "createEnvironment"
    | "saveBot"
    | "editBot"
    | "enableBot"
    | "disableBot"
    | "deleteBot"
    | "testBot"
    | "copy"
    | "clearLogs"
    | "pauseScroll"
    | "resumeScroll"
    | "downloadLogs"
    | "createBot"
    | "addBot"
    | "createThread"
    | "saveBinding"
    | "showCreateThread"
    | "pinThread"
    | "unpinThread"
    | "approve"
    | "reject"
    | "log"
    | "cancel"
    | "send",
    string
  >;
  toast: Record<
    | "dismiss"
    | "savingSettings"
    | "savedSettings"
    | "saveSettingsFailed"
    | "savingEnvironment"
    | "savedEnvironment"
    | "saveEnvironmentFailed"
    | "deletingEnvironment"
    | "deletedEnvironment"
    | "deleteEnvironmentFailed"
    | "creatingEnvironment"
    | "createdEnvironment"
    | "createEnvironmentFailed"
    | "savingBot"
    | "savedBot"
    | "saveBotFailed"
    | "creatingBot"
    | "createdBot"
    | "createBotFailed"
    | "deletingBot"
    | "deletedBot"
    | "deleteBotFailed"
    | "testingBot"
    | "testedBot"
    | "testBotFailed"
    | "copied"
    | "logsCleared"
    | "logsDownloaded"
    | "creatingThread"
    | "createdThread"
    | "createThreadFailed"
    | "savingBinding"
    | "savedBinding"
    | "saveBindingFailed"
    | "sendingMessage"
    | "sentMessage"
    | "sendMessageFailed"
    | "uploadingAttachments"
    | "uploadedAttachments"
    | "uploadAttachmentsFailed"
    | "refreshingThreads"
    | "refreshedThreads"
    | "refreshThreadsFailed"
    | "approvingTask"
    | "approvedTask"
    | "rejectingTask"
    | "rejectedTask"
    | "approvalFailed"
    | "cancellingTask"
    | "cancelledTask"
    | "cancelTaskFailed"
    | "loadingTaskLog"
    | "loadedTaskLog"
    | "loadTaskLogFailed",
    string
  >;
  empty: Record<"noBots" | "noThreads" | "noTasks" | "noLogs" | "noCwd" | "noMessages" | "noEnvironments", string>;
  options: Record<"unbound" | "queue" | "steer" | "both" | "structured" | "raw" | "doNotBind" | "comingSoon", string>;
  defaults: Record<"botName" | "botFallbackName" | "threadTitle", string>;
  botStatus: Record<BotStatus, string>;
  taskStatus: Record<TaskStatus, string>;
  threadStatus: Record<CodexThreadStatus, string>;
  source: Record<GatewayTask["source"], string>;
  channelType: Record<ChannelType, string>;
  providerType: Record<CodexThreadSummary["providerType"], string>;
  logLevel: Record<DashboardState["logs"][number]["level"], string>;
};

const localeStorageKey = "local-agent-gateway.locale";

const translations: Record<Locale, Translations> = {
  zh: {
    documentTitle: "本地智能体网关",
    languageAria: "切换界面语言",
    languageZh: "中文",
    languageEn: "English",
    brandTitle: "本地智能体网关",
    brandSubtitle: "本机智能体代理到各渠道",
    environment: "环境",
    environmentOverview: "环境总览",
    environmentSettings: "环境设置",
    globalSettings: "全局设置",
    createEnvironment: "创建环境",
    createEnvironmentDescription: "为本地智能体创建一个新的工作上下文。环境只保存元数据、默认工作目录和 provider 适配关系；本体会话仍来自底层智能体。",
    addEnvironment: "添加新环境",
    saveEnvironment: "保存环境",
    environmentCount: "环境",
    currentEnvironmentLabel: "当前环境",
    environmentObjects: "环境对象",
    boundRouteLabel: "绑定路由",
    gatewaySettings: "网关设置",
    feishuBots: "飞书出口",
    channelOutputs: "即时通讯出口",
    pageDescriptions: {
      tasks: "当前环境下所有来自网页和飞书的执行任务，按本地智能体会话串行进入队列。",
      logs: "当前环境的网关日志、Provider 运行日志和渠道事件日志，用于排查远程控制链路。",
      bots: "全局管理飞书机器人出口；每个出口显式绑定到一个环境里的一个本地智能体会话。",
      settings: "对整个网关生效的本地配置。环境内默认目录、会话绑定和飞书出口在各自页面维护。"
    },
    threadsTitle: "智能体会话",
    threadsSubtitle: "本地智能体原生会话是系统本体；网关只做发现、绑定、转发和运行状态展示。",
    refresh: "刷新",
    chatTitle: "对话",
    selectOrCreateThread: "选择或新建一个本地智能体会话。",
    selectedThreadBinding: "当前发送出口",
    selectedSessionBindings: "已绑定机器人",
    loadingHistory: "正在加载历史对话...",
    expandChat: "放大对话",
    close: "关闭",
    userLabel: "你",
    agentLabel: "智能体",
    imageAttachment: "图片",
    imageAlt: "对话图片",
    fileAttachment: "文件",
    taskQueue: "任务队列",
    logsTitle: "运行日志",
    logDetailTitle: "日志详情",
    botConfigSummary: "凭据、权限和输出模式",
    dangerZoneTitle: "危险区域",
    dangerZoneDescription: "删除只会移除网关内的环境配置和相关绑定，不会删除本机智能体会话、工作目录或 ~/.codex 历史。",
    emptyTasksTitle: "暂无排队任务",
    emptyTasksDescription: "来自网页、飞书和本地智能体会话的任务会在这里按时间进入队列。",
    confirmDeleteBot: "确认删除这个机器人？会话不会被删除，但飞书入口配置会移除。",
    confirmDeleteEnvironment: "确认删除这个网关环境？只会删除网关内的环境配置和相关机器人绑定，不会删除本机智能体会话、工作目录或 ~/.codex 历史。",
    threadCount: "会话",
    activeThreadLabel: "当前会话",
    noSelection: "未选择",
    workdirLabel: "目录",
    providerLabel: "驱动",
    providerTypeLabel: "智能体类型",
    channelLabel: "渠道",
    channelBotLabel: "渠道机器人",
    lastActivityLabel: "最近活动",
    copiedThreadId: "会话 ID 已复制",
    fields: {
      dataDir: "数据目录",
      environmentName: "环境名称",
      environmentDescription: "环境说明",
      environmentProvider: "智能体驱动",
      environmentDefaultCwd: "环境默认工作目录",
      environmentEnabled: "启用环境",
      environmentDefault: "设为默认环境",
      defaultCwd: "默认工作目录",
      codexCommand: "Codex 命令",
      appServerListen: "App-server 监听",
      preferAppServer: "优先使用 Codex app-server",
      name: "名称",
      appId: "App ID",
      appSecret: "App Secret",
      verificationToken: "Verification Token",
      encryptKey: "Encrypt Key",
      allowedOpenIds: "允许的用户 Open ID",
      allowedChatIds: "允许的群 Chat ID",
      activeThread: "绑定会话",
      runningMessages: "运行中消息处理",
      outputMode: "输出模式",
      enabled: "启用机器人",
      title: "标题",
      workingDirectory: "工作目录",
      bindToBot: "绑定到机器人",
      threadBinding: "会话绑定机器人",
      threadSearch: "搜索会话",
      channel: "渠道",
      attachments: "附件"
    },
    help: {
      dataDir: "网关保存配置、日志、飞书附件缓存和任务原始输出的位置。首版使用 ~/.local-agent-gateway。",
      environmentName: "环境是当前视图和资源边界，类似 Rancher 1.6 的 Environment。一个环境下管理一组本地智能体会话、任务、日志和绑定。",
      environmentDescription: "用于说明这个环境面向哪个电脑、项目组或工作场景。只影响 Web UI 展示。",
      environmentProvider: "环境背后的本地智能体实现。MVP 只有 Codex，后续可扩展 Claude Code、OpenClaw 等。",
      environmentDefaultCwd: "在这个环境中新建会话时默认使用的工作目录。会话创建后仍保留自己的 cwd。",
      environmentEnabled: "关闭后保留配置但不建议继续向该环境派发任务。MVP 暂不强制阻断历史会话读取。",
      environmentDefault: "默认环境用于兼容旧接口和初始进入页面；飞书消息仍严格按机器人绑定的环境和会话路由。",
      defaultCwd: "新建本地智能体会话时默认进入的目录。建议填写常用项目根目录；单个会话仍可单独指定目录。",
      codexCommand: "用于拉起本机 Codex 的命令。默认 codex；如果 PATH 找不到，可以填写完整可执行文件路径。",
      appServerListen: "Codex remote-control/app-server 的连接地址。当前 MVP 默认使用 stdio:// 由网关直接启动和通信。",
      preferAppServer: "开启后优先走 Codex 实验性 app-server/remote-control 能力；关闭时退回到命令执行模式。",
      name: "只在本地控制台展示，用来区分多个飞书机器人。",
      channel: "选择即时通讯平台。MVP 支持飞书，钉钉和微信预留为后续渠道适配。",
      appId: "飞书开放平台自建应用的 App ID。每个机器人独立配置一组飞书凭据。",
      appSecret: "飞书开放平台自建应用的 App Secret。用于启动 WSClient、收发消息和下载附件。",
      verificationToken: "飞书事件与回调配置里的 Verification Token。长连接事件和卡片回调都会使用同一组应用配置；为空则不校验该字段。",
      encryptKey: "飞书事件与回调配置里的 Encrypt Key。应用启用加密推送时必须填写；未启用可留空。",
      allowedOpenIds: "逗号分隔。留空表示所有私聊用户都允许发指令，适合个人 MVP；后续可收紧权限。",
      allowedChatIds: "逗号分隔。留空表示所有群都允许发指令；同一个机器人的私聊和群聊都会进入绑定的同一会话。",
      activeThread: "兼容字段：表示这个飞书机器人当前指向哪个本地智能体会话。建议在会话列表里切换绑定。",
      runningMessages: "排队：当前任务完成后再执行新消息。转为下一步指令：把新消息作为同一会话后续输入，适合远程补充要求。",
      outputMode: "控制飞书卡片和网页控制台展示 Codex 输出的方式：结构化状态、原始输出，或两者同时展示。",
      enabled: "开启后网关会启动该飞书机器人的 WSClient。飞书事件配置选择“长连接接收事件”并订阅接收消息事件；回调配置选择“长连接接收回调”即可接收卡片按钮。",
      title: "用于在控制台识别这个本地智能体会话。",
      workingDirectory: "该会话的 cwd。留空时使用网关设置里的默认工作目录。",
      bindToBot: "创建后立即把这个会话设为某个飞书机器人的当前活跃会话。",
      threadBinding: "一个机器人只能绑定一个会话；同一个会话可以绑定多个机器人。飞书私聊和群聊收到的消息都会进入该机器人当前绑定的同一会话。",
      attachments: "支持从网页控制台上传图片和普通文件。文件会暂存到网关数据目录，并作为 Codex 输入传递。"
    },
    placeholders: {
      defaultCwd: "例如 /Users/me/workspace/project",
      environmentDescription: "例如：家里 MacBook / 公司 iMac / Codex 日常环境",
      allowedUsers: "留空表示允许所有用户",
      allowedChats: "留空表示允许所有群",
      useDefaultCwd: "留空使用默认工作目录",
      instruction: "给当前本地智能体会话发送自然语言指令",
      threadSearch: "按标题、目录或机器人过滤"
    },
    actions: {
      saveSettings: "保存设置",
      switchEnvironment: "切换环境",
      saveEnvironment: "保存环境",
      deleteEnvironment: "删除环境",
      createEnvironment: "创建环境",
      saveBot: "保存机器人",
      editBot: "编辑配置",
      enableBot: "启用",
      disableBot: "禁用",
      deleteBot: "删除机器人",
      testBot: "测试连接",
      copy: "复制",
      clearLogs: "清空",
      pauseScroll: "暂停滚动",
      resumeScroll: "继续滚动",
      downloadLogs: "下载日志",
      createBot: "创建机器人",
      addBot: "新增机器人",
      createThread: "创建会话",
      saveBinding: "保存绑定",
      showCreateThread: "新建会话",
      pinThread: "快速置顶",
      unpinThread: "取消置顶",
      approve: "同意",
      reject: "拒绝",
      log: "日志",
      cancel: "取消",
      send: "发送"
    },
    toast: {
      dismiss: "关闭提示",
      savingSettings: "正在保存设置...",
      savedSettings: "设置已保存",
      saveSettingsFailed: "保存设置失败",
      savingEnvironment: "正在保存环境...",
      savedEnvironment: "环境已保存",
      saveEnvironmentFailed: "保存环境失败",
      deletingEnvironment: "正在删除环境...",
      deletedEnvironment: "环境已删除",
      deleteEnvironmentFailed: "删除环境失败",
      creatingEnvironment: "正在创建环境...",
      createdEnvironment: "环境已创建",
      createEnvironmentFailed: "创建环境失败",
      savingBot: "正在保存机器人配置...",
      savedBot: "机器人配置已保存",
      saveBotFailed: "保存机器人配置失败",
      creatingBot: "正在创建机器人...",
      createdBot: "机器人已创建",
      createBotFailed: "创建机器人失败",
      deletingBot: "正在删除机器人...",
      deletedBot: "机器人已删除",
      deleteBotFailed: "删除机器人失败",
      testingBot: "正在测试飞书连接...",
      testedBot: "飞书连接正常",
      testBotFailed: "飞书连接失败",
      copied: "已复制",
      logsCleared: "已清空当前页面日志",
      logsDownloaded: "日志已下载",
      creatingThread: "正在创建会话...",
      createdThread: "会话已创建",
      createThreadFailed: "创建会话失败",
      savingBinding: "正在保存会话绑定...",
      savedBinding: "会话绑定已保存",
      saveBindingFailed: "保存会话绑定失败",
      sendingMessage: "正在发送消息...",
      sentMessage: "消息已发送",
      sendMessageFailed: "发送消息失败",
      uploadingAttachments: "正在上传附件...",
      uploadedAttachments: "附件已上传",
      uploadAttachmentsFailed: "上传附件失败",
      refreshingThreads: "正在刷新会话...",
      refreshedThreads: "会话已刷新",
      refreshThreadsFailed: "刷新会话失败",
      approvingTask: "正在同意任务...",
      approvedTask: "已同意任务",
      rejectingTask: "正在拒绝任务...",
      rejectedTask: "已拒绝任务",
      approvalFailed: "处理审批失败",
      cancellingTask: "正在取消任务...",
      cancelledTask: "任务已取消",
      cancelTaskFailed: "取消任务失败",
      loadingTaskLog: "正在读取任务日志...",
      loadedTaskLog: "任务日志已打开",
      loadTaskLogFailed: "读取任务日志失败"
    },
    empty: {
      noBots: "还没有配置机器人。",
      noThreads: "还没有扫描到会话。",
      noTasks: "暂无任务。",
      noLogs: "暂无日志。",
      noCwd: "未设置工作目录",
      noMessages: "这个会话还没有可展示的历史消息。",
      noEnvironments: "还没有配置环境。"
    },
    options: {
      unbound: "未绑定",
      queue: "排队执行",
      steer: "作为下一步指令",
      both: "结构化 + 原始输出",
      structured: "仅结构化状态",
      raw: "仅原始输出",
      doNotBind: "不绑定",
      comingSoon: "即将支持"
    },
    defaults: {
      botName: "我的飞书机器人",
      botFallbackName: "飞书机器人",
      threadTitle: "新的远程任务"
    },
    botStatus: {
      disabled: "未启用",
      disconnected: "未连接",
      connecting: "连接中",
      connected: "已连接",
      error: "错误"
    },
    taskStatus: {
      queued: "排队中",
      running: "运行中",
      waiting_approval: "等待确认",
      completed: "已完成",
      failed: "失败",
      cancelled: "已取消"
    },
    threadStatus: {
      unknown: "未知",
      idle: "空闲",
      running: "运行中",
      waiting_approval: "等待确认",
      error: "错误"
    },
    source: {
      lark: "飞书",
      dingtalk: "钉钉",
      wechat: "微信",
      web: "网页"
    },
    channelType: {
      lark: "飞书",
      dingtalk: "钉钉",
      wechat: "微信"
    },
    providerType: {
      codex: "Codex",
      "claude-code": "Claude Code",
      openclaw: "OpenClaw",
      hermes: "Hermes"
    },
    logLevel: {
      debug: "调试",
      info: "信息",
      warn: "警告",
      error: "错误"
    }
  },
  en: {
    documentTitle: "Local Agent Gateway",
    languageAria: "Switch interface language",
    languageZh: "中文",
    languageEn: "English",
    brandTitle: "Local Agent Gateway",
    brandSubtitle: "Route local agents to every channel",
    environment: "Environment",
    environmentOverview: "Environment Overview",
    environmentSettings: "Environment Settings",
    globalSettings: "Global Settings",
    createEnvironment: "Create Environment",
    createEnvironmentDescription: "Create a new local-agent working context. An environment stores metadata, a default working directory, and the provider adapter; sessions still come from the underlying agent.",
    addEnvironment: "Add Environment",
    saveEnvironment: "Save Environment",
    environmentCount: "environments",
    currentEnvironmentLabel: "Current Environment",
    environmentObjects: "Environment Objects",
    boundRouteLabel: "Bound Route",
    gatewaySettings: "Gateway Settings",
    feishuBots: "Feishu Outputs",
    channelOutputs: "Messaging Outputs",
    pageDescriptions: {
      tasks: "All web and Feishu execution tasks in the current environment, queued serially into local agent sessions.",
      logs: "Gateway, provider, and channel event logs for diagnosing the remote-control path in the current environment.",
      bots: "Manage Feishu output bots globally. Each bot explicitly binds to one local agent session in one environment.",
      settings: "Local settings that apply to the whole gateway. Environment defaults, session bindings, and bots live in their own pages."
    },
    threadsTitle: "Agent Sessions",
    threadsSubtitle: "Provider-native local agent sessions are the core entity. The gateway only discovers, binds, routes, and displays runtime state.",
    refresh: "Refresh",
    chatTitle: "Chat",
    selectOrCreateThread: "Select or create a local agent session.",
    selectedThreadBinding: "Current outbound bot",
    selectedSessionBindings: "Bound bots",
    loadingHistory: "Loading conversation history...",
    expandChat: "Expand chat",
    close: "Close",
    userLabel: "You",
    agentLabel: "Agent",
    imageAttachment: "Image",
    imageAlt: "Chat image",
    fileAttachment: "File",
    taskQueue: "Task Queue",
    logsTitle: "Runtime Logs",
    logDetailTitle: "Log Detail",
    botConfigSummary: "Credentials, access control, and output mode",
    dangerZoneTitle: "Danger Zone",
    dangerZoneDescription: "Deleting only removes gateway environment metadata and related bindings. It will not delete local agent sessions, working directories, or ~/.codex history.",
    emptyTasksTitle: "No queued tasks",
    emptyTasksDescription: "Tasks from web, Feishu, and local agent sessions will appear here in queue order.",
    confirmDeleteBot: "Delete this bot? Sessions will remain, but this Feishu output configuration will be removed.",
    confirmDeleteEnvironment: "Delete this gateway environment? This only removes the gateway environment config and related bot bindings. It will not delete local agent sessions, working directories, or ~/.codex history.",
    threadCount: "sessions",
    activeThreadLabel: "Current Session",
    noSelection: "No selection",
    workdirLabel: "Directory",
    providerLabel: "Provider",
    providerTypeLabel: "Agent Type",
    channelLabel: "Channel",
    channelBotLabel: "Channel Bot",
    lastActivityLabel: "Last Activity",
    copiedThreadId: "Session key copied",
    fields: {
      dataDir: "Data Directory",
      environmentName: "Environment Name",
      environmentDescription: "Environment Description",
      environmentProvider: "Agent Provider",
      environmentDefaultCwd: "Environment Default Working Directory",
      environmentEnabled: "Enable Environment",
      environmentDefault: "Set As Default Environment",
      defaultCwd: "Default Working Directory",
      codexCommand: "Codex Command",
      appServerListen: "App-server Listen",
      preferAppServer: "Prefer Codex app-server",
      name: "Name",
      appId: "App ID",
      appSecret: "App Secret",
      verificationToken: "Verification Token",
      encryptKey: "Encrypt Key",
      allowedOpenIds: "Allowed User Open IDs",
      allowedChatIds: "Allowed Group Chat IDs",
      activeThread: "Bound Session",
      runningMessages: "Messages While Running",
      outputMode: "Output Mode",
      enabled: "Enable Bot",
      title: "Title",
      workingDirectory: "Working Directory",
      bindToBot: "Bind To Bot",
      threadBinding: "Session Bot Binding",
      threadSearch: "Search Sessions",
      channel: "Channel",
      attachments: "Attachments"
    },
    help: {
      dataDir: "Where the gateway stores configuration, logs, Feishu attachment cache, and raw task output. The first version uses ~/.local-agent-gateway.",
      environmentName: "The environment is the current view and resource boundary, similar to Rancher 1.6 Environment. It owns local agent sessions, tasks, logs, and bindings.",
      environmentDescription: "Describe the computer, team, or work scenario represented by this environment. It only affects the Web UI.",
      environmentProvider: "The local agent implementation behind this environment. The MVP only implements Codex; future providers can add Claude Code, OpenClaw, and more.",
      environmentDefaultCwd: "Default working directory for new sessions in this environment. Each created session still keeps its own cwd.",
      environmentEnabled: "Keeps the environment config but marks it inactive. The MVP does not hard-block historical session reads.",
      environmentDefault: "The default environment is used for legacy APIs and initial page load. Feishu messages still route by each bot's explicit environment and session binding.",
      defaultCwd: "Default directory for newly created local agent sessions. Use a common project root; each session can still override it.",
      codexCommand: "Command used to start local Codex. The default is codex; use a full executable path if PATH cannot resolve it.",
      appServerListen: "Connection address for Codex remote-control/app-server. The MVP defaults to stdio:// so the gateway starts and talks to Codex directly.",
      preferAppServer: "When enabled, the gateway prefers Codex experimental app-server/remote-control. When disabled, it falls back to command execution mode.",
      name: "Local display name used to distinguish multiple Feishu bots.",
      channel: "Choose the messaging platform. The MVP supports Lark; DingTalk and WeChat are reserved for future adapters.",
      appId: "App ID from your Feishu custom app. Each bot has an independent Feishu credential set.",
      appSecret: "App Secret from your Feishu custom app. Used to start WSClient, send messages, and download attachments.",
      verificationToken: "Verification Token from Feishu event and callback settings. Long-connection events and card callbacks use the same app configuration. Leave empty to skip this field check.",
      encryptKey: "Encrypt Key from Feishu event and callback settings. Required only if encrypted delivery is enabled.",
      allowedOpenIds: "Comma-separated. Empty means all direct-message users can send instructions, which is convenient for a personal MVP.",
      allowedChatIds: "Comma-separated. Empty means all group chats are allowed. Direct messages and groups for the same bot enter the same bound session.",
      activeThread: "Compatibility field: the local agent session this Feishu bot currently points to. Prefer switching bindings in the session list.",
      runningMessages: "Queue: run new messages after the current task. Steer next: treat new messages as follow-up input for the same session.",
      outputMode: "Controls whether Feishu cards and the web console show structured state, raw Codex output, or both.",
      enabled: "When enabled, the gateway starts this bot's WSClient. In Feishu event config, use long connection for message events; in callback config, use long connection for card buttons.",
      title: "Local display title for this local agent session.",
      workingDirectory: "cwd for this session. Leave empty to use the gateway default working directory.",
      bindToBot: "Immediately make the new session the active session for a Feishu bot.",
      threadBinding: "One bot can bind only one session; one session can bind multiple bots. Direct messages and group messages for a bot enter that bot's currently bound session.",
      attachments: "Upload images and regular files from the web console. Files are stored in the gateway data directory and passed to Codex as input."
    },
    placeholders: {
      defaultCwd: "e.g. /Users/me/workspace/project",
      environmentDescription: "e.g. Home MacBook / Office iMac / Daily Codex environment",
      allowedUsers: "Empty means all users are allowed",
      allowedChats: "Empty means all groups are allowed",
      useDefaultCwd: "Empty uses default working directory",
      instruction: "Send a natural-language instruction to the selected local agent session",
      threadSearch: "Filter by title, directory, or bot"
    },
    actions: {
      saveSettings: "Save Settings",
      switchEnvironment: "Switch Environment",
      saveEnvironment: "Save Environment",
      deleteEnvironment: "Delete Environment",
      createEnvironment: "Create Environment",
      saveBot: "Save Bot",
      editBot: "Edit Config",
      enableBot: "Enable",
      disableBot: "Disable",
      deleteBot: "Delete Bot",
      testBot: "Test Connection",
      copy: "Copy",
      clearLogs: "Clear",
      pauseScroll: "Pause Scroll",
      resumeScroll: "Resume Scroll",
      downloadLogs: "Download Logs",
      createBot: "Create Bot",
      addBot: "Add Bot",
      createThread: "Create Session",
      saveBinding: "Save Binding",
      showCreateThread: "New Session",
      pinThread: "Pin",
      unpinThread: "Unpin",
      approve: "Approve",
      reject: "Reject",
      log: "Log",
      cancel: "Cancel",
      send: "Send"
    },
    toast: {
      dismiss: "Dismiss notification",
      savingSettings: "Saving settings...",
      savedSettings: "Settings saved",
      saveSettingsFailed: "Failed to save settings",
      savingEnvironment: "Saving environment...",
      savedEnvironment: "Environment saved",
      saveEnvironmentFailed: "Failed to save environment",
      deletingEnvironment: "Deleting environment...",
      deletedEnvironment: "Environment deleted",
      deleteEnvironmentFailed: "Failed to delete environment",
      creatingEnvironment: "Creating environment...",
      createdEnvironment: "Environment created",
      createEnvironmentFailed: "Failed to create environment",
      savingBot: "Saving bot configuration...",
      savedBot: "Bot configuration saved",
      saveBotFailed: "Failed to save bot configuration",
      creatingBot: "Creating bot...",
      createdBot: "Bot created",
      createBotFailed: "Failed to create bot",
      deletingBot: "Deleting bot...",
      deletedBot: "Bot deleted",
      deleteBotFailed: "Failed to delete bot",
      testingBot: "Testing Feishu connection...",
      testedBot: "Feishu connection is healthy",
      testBotFailed: "Feishu connection failed",
      copied: "Copied",
      logsCleared: "Current page logs cleared",
      logsDownloaded: "Logs downloaded",
      creatingThread: "Creating session...",
      createdThread: "Session created",
      createThreadFailed: "Failed to create session",
      savingBinding: "Saving session binding...",
      savedBinding: "Session binding saved",
      saveBindingFailed: "Failed to save session binding",
      sendingMessage: "Sending message...",
      sentMessage: "Message sent",
      sendMessageFailed: "Failed to send message",
      uploadingAttachments: "Uploading attachments...",
      uploadedAttachments: "Attachments uploaded",
      uploadAttachmentsFailed: "Failed to upload attachments",
      refreshingThreads: "Refreshing sessions...",
      refreshedThreads: "Sessions refreshed",
      refreshThreadsFailed: "Failed to refresh sessions",
      approvingTask: "Approving task...",
      approvedTask: "Task approved",
      rejectingTask: "Rejecting task...",
      rejectedTask: "Task rejected",
      approvalFailed: "Failed to process approval",
      cancellingTask: "Cancelling task...",
      cancelledTask: "Task cancelled",
      cancelTaskFailed: "Failed to cancel task",
      loadingTaskLog: "Loading task log...",
      loadedTaskLog: "Task log opened",
      loadTaskLogFailed: "Failed to load task log"
    },
    empty: {
      noBots: "No bots configured.",
      noThreads: "No sessions found yet.",
      noTasks: "No tasks yet.",
      noLogs: "No logs yet.",
      noCwd: "No working directory",
      noMessages: "This session has no displayable history yet.",
      noEnvironments: "No environments configured."
    },
    options: {
      unbound: "Unbound",
      queue: "Queue",
      steer: "Steer next",
      both: "Structured + Raw",
      structured: "Structured Only",
      raw: "Raw Only",
      doNotBind: "Do not bind",
      comingSoon: "Coming Soon"
    },
    defaults: {
      botName: "My Feishu Bot",
      botFallbackName: "Feishu Bot",
      threadTitle: "New remote task"
    },
    botStatus: {
      disabled: "Disabled",
      disconnected: "Disconnected",
      connecting: "Connecting",
      connected: "Connected",
      error: "Error"
    },
    taskStatus: {
      queued: "Queued",
      running: "Running",
      waiting_approval: "Waiting approval",
      completed: "Completed",
      failed: "Failed",
      cancelled: "Cancelled"
    },
    threadStatus: {
      unknown: "Unknown",
      idle: "Idle",
      running: "Running",
      waiting_approval: "Waiting approval",
      error: "Error"
    },
    source: {
      lark: "Lark",
      dingtalk: "DingTalk",
      wechat: "WeChat",
      web: "Web"
    },
    channelType: {
      lark: "Lark",
      dingtalk: "DingTalk",
      wechat: "WeChat"
    },
    providerType: {
      codex: "Codex",
      "claude-code": "Claude Code",
      openclaw: "OpenClaw",
      hermes: "Hermes"
    },
    logLevel: {
      debug: "Debug",
      info: "Info",
      warn: "Warn",
      error: "Error"
    }
  }
};

const defaultBotNames = [translations.zh.defaults.botName, translations.en.defaults.botName];
const defaultThreadTitles = [translations.zh.defaults.threadTitle, translations.en.defaults.threadTitle];
const channelOptions: Array<{ value: ChannelType; disabled?: boolean }> = [
  { value: "lark" },
  { value: "dingtalk", disabled: true },
  { value: "wechat", disabled: true }
];
const fallbackEnvironment: EnvironmentConfig = {
  id: "default",
  name: "默认环境",
  description: "本机默认智能体环境",
  enabled: true,
  providerId: "codex",
  providerType: "codex",
  defaultCwd: "",
  isDefault: true,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString()
};

type Toast = {
  id: number;
  message: string;
  tone: "loading" | "success" | "error";
};

type RunWithToast = <T>(
  action: () => Promise<T>,
  messages: { loading: string; success: string; error: string }
) => Promise<T | undefined>;

const emptyState: DashboardState = {
  config: {
    dataDir: "~/.local-agent-gateway",
    defaultCwd: "",
    server: { host: "127.0.0.1", port: 3030 },
    codex: {
      command: "codex",
      preferAppServer: true,
      appServerListen: "stdio://"
    },
    providers: [
      {
        id: "codex",
        type: "codex",
        name: "Codex",
        enabled: true,
        command: "codex",
        preferAppServer: true,
        appServerListen: "stdio://"
      }
    ],
    environments: [fallbackEnvironment],
    defaultEnvironmentId: "default",
    bots: []
  },
  environments: [fallbackEnvironment],
  sessions: [],
  threads: [],
  tasks: [],
  logs: []
};

function App() {
  const [state, setState] = useState<DashboardState>(emptyState);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string>("");
  const [selectedBotId, setSelectedBotId] = useState<string>("");
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [locale, setLocale] = useState<Locale>(getInitialLocale);
  const [toast, setToast] = useState<Toast | undefined>();
  const [page, setPage] = useState<"environment" | "newEnvironment" | "tasks" | "logs" | "settings">("environment");
  const [settingsTab, setSettingsTab] = useState<"gateway" | "outputs">("gateway");
  const t = translations[locale];

  function showToast(message: string, tone: Toast["tone"]) {
    const id = Date.now();
    setToast({ id, message, tone });
    if (tone !== "loading") {
      window.setTimeout(() => {
        setToast((current) => (current?.id === id ? undefined : current));
      }, 2800);
    }
  }

  async function runWithToast<T>(
    action: () => Promise<T>,
    messages: { loading: string; success: string; error: string }
  ): Promise<T | undefined> {
    showToast(messages.loading, "loading");
    try {
      const result = await action();
      showToast(messages.success, "success");
      return result;
    } catch (error) {
      showToast(`${messages.error}: ${errorMessage(error)}`, "error");
      return undefined;
    }
  }

  useEffect(() => {
    void loadState();
    const source = new EventSource("/events");
    source.onmessage = (event) => {
      const parsed = JSON.parse(event.data) as GatewayEvent;
      setState((current) => reduceEvent(current, parsed));
    };
    return () => source.close();
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.title = t.documentTitle;
    try {
      localStorage.setItem(localeStorageKey, locale);
    } catch {
      // Ignore localStorage failures; the switch should still work for the current session.
    }
  }, [locale, t.documentTitle]);

  async function fetchState(): Promise<DashboardState> {
    const response = await fetch("/api/state");
    const data = (await response.json()) as DashboardState;
    const normalizedData = normalizeDashboardState(data);
    setState(normalizedData);
    return normalizedData;
  }

  async function loadState(): Promise<void> {
    await fetchState();
  }

  const selectedEnvironment =
    findEnvironmentById(state.environments, selectedEnvironmentId) ??
    findEnvironmentById(state.environments, state.config.defaultEnvironmentId) ??
    state.environments[0] ??
    fallbackEnvironment;
  const environmentId = selectedEnvironment?.id ?? "default";
  const environmentSessions = sessionsForEnvironment(state.sessions, environmentId);
  const environmentTasks = tasksForEnvironment(state.tasks, environmentId);
  const environmentLogs = logsForEnvironment(state.logs, environmentId);
  const environmentBots = botsForEnvironment(state.config.bots, environmentId);
  const preferredThreadKey = preferredSessionKeyForEnvironment(environmentBots, environmentSessions);
  const selectedThread =
    findThreadByKey(environmentSessions, selectedThreadId || preferredThreadKey) ??
    findThreadByKey(environmentSessions, preferredThreadKey) ??
    environmentSessions[0];
  const selectedThreadBots = selectedThread ? boundBotsForThread(environmentBots, selectedThread, environmentId) : [];
  const selectedThreadBot =
    selectedThreadBots.find((bot) => bot.id === selectedBotId) ?? selectedThreadBots[0];

  useEffect(() => {
    if (selectedEnvironmentId || state.environments.length === 0) {
      return;
    }
    const nextEnvironment =
      findOperationalEnvironment(
        state.environments,
        state.sessions,
        state.config.bots,
        state.config.defaultEnvironmentId
      ) ??
      state.environments[0] ??
      fallbackEnvironment;
    setSelectedEnvironmentId(nextEnvironment.id);
  }, [selectedEnvironmentId, state.config.bots, state.config.defaultEnvironmentId, state.environments, state.sessions]);

  useEffect(() => {
    if (!environmentId || environmentSessions.length === 0) {
      return;
    }
    const nextThreadId = preferredThreadKey ?? environmentSessions[0]?.sessionKey ?? environmentSessions[0]?.id ?? "";
    const selectedExists = Boolean(findThreadByKey(environmentSessions, selectedThreadId));
    if (!selectedThreadId || !selectedExists) {
      setSelectedThreadId(nextThreadId);
    }
  }, [environmentBots, environmentId, environmentSessions, preferredThreadKey, selectedThreadId]);

  useEffect(() => {
    if (!environmentId || selectedBotId) {
      return;
    }
    const nextBotId = selectedThread
      ? boundBotsForThread(environmentBots, selectedThread, environmentId)[0]?.id
      : undefined;
    setSelectedBotId(nextBotId ?? environmentBots[0]?.id ?? "");
  }, [environmentBots, environmentId, selectedBotId, selectedThread]);

  function selectEnvironment(environmentId: string) {
    setSelectedEnvironmentId(environmentId);
    const nextSessions = sessionsForEnvironment(state.sessions, environmentId);
    const nextBots = botsForEnvironment(state.config.bots, environmentId);
    const nextThreadId = preferredSessionKeyForEnvironment(nextBots, nextSessions) ?? nextSessions[0]?.sessionKey ?? nextSessions[0]?.id ?? "";
    setSelectedThreadId(nextThreadId);
    setSelectedBotId(boundBotsForThread(nextBots, nextThreadId, environmentId)[0]?.id ?? nextBots[0]?.id ?? "");
    setPage("environment");
  }

  function showNewEnvironmentPage() {
    setPage("newEnvironment");
  }

  async function handleEnvironmentDeleted(deletedEnvironmentId: string) {
    const nextState = await fetchState();
    const nextEnvironment =
      findEnvironmentById(nextState.environments, nextState.config.defaultEnvironmentId) ??
      nextState.environments.find((environment) => environment.id !== deletedEnvironmentId) ??
      nextState.environments[0] ??
      fallbackEnvironment;
    const nextSessions = sessionsForEnvironment(nextState.sessions, nextEnvironment.id);
    const nextBots = botsForEnvironment(nextState.config.bots, nextEnvironment.id);
    const nextThreadId = preferredSessionKeyForEnvironment(nextBots, nextSessions) ?? nextSessions[0]?.sessionKey ?? nextSessions[0]?.id ?? "";
    setSelectedEnvironmentId(nextEnvironment.id);
    setSelectedThreadId(nextThreadId);
    setSelectedBotId(boundBotsForThread(nextBots, nextThreadId, nextEnvironment.id)[0]?.id ?? nextBots[0]?.id ?? "");
    setPage("environment");
  }

  return (
    <div className="app-frame">
      <header className="top-nav">
        <div className="top-brand">
          <div className="brand-mark">AG</div>
          <div>
            <h1>{t.brandTitle}</h1>
            <p>{t.brandSubtitle}</p>
          </div>
        </div>
        <EnvironmentSwitcher
          environments={state.environments}
          selectedEnvironmentId={environmentId}
          onSelect={selectEnvironment}
          onCreate={showNewEnvironmentPage}
          t={t}
        />
        <nav className="top-menu" role="tablist">
          <span className="top-menu-group">
            <button
              className={page === "environment" || page === "newEnvironment" ? "active" : ""}
              onClick={() => setPage("environment")}
            >
              {t.environment}
            </button>
            <button
              className={page === "tasks" ? "active" : ""}
              onClick={() => setPage("tasks")}
            >
              {t.taskQueue}
            </button>
            <button
              className={page === "logs" ? "active" : ""}
              onClick={() => setPage("logs")}
            >
              {t.logsTitle}
            </button>
          </span>
          <span className="top-menu-group">
            <button
              className={page === "settings" ? "active" : ""}
              onClick={() => setPage("settings")}
            >
              {t.globalSettings}
            </button>
          </span>
        </nav>
        <div className="top-actions">
          <div className="language-switch" aria-label={t.languageAria}>
            <button
              className={locale === "zh" ? "active" : ""}
              aria-pressed={locale === "zh"}
              onClick={() => setLocale("zh")}
            >
              {t.languageZh}
            </button>
            <button
              className={locale === "en" ? "active" : ""}
              aria-pressed={locale === "en"}
              onClick={() => setLocale("en")}
            >
              {t.languageEn}
            </button>
          </div>
        </div>
      </header>

      {page === "environment" ? (
        <main className="environment-page">
          <section className="environment-page-header">
            <div>
              <span>{t.currentEnvironmentLabel}</span>
              <h2>{selectedEnvironment?.name ?? t.environment}</h2>
              <p>{selectedEnvironment?.description || t.threadsSubtitle}</p>
            </div>
            <div className="environment-page-meta">
              <span>{selectedEnvironment ? t.providerType[selectedEnvironment.providerType] : "-"}</span>
              <span>{environmentSessions.length} {t.threadCount}</span>
              <span>{environmentBots.length} {t.feishuBots}</span>
            </div>
          </section>
          <div className="app-shell">
            <aside className="session-sidebar">
              <section className="panel thread-panel">
                <div className="section-header">
                  <div>
                    <h2>{t.threadsTitle}</h2>
                    <p>{t.threadsSubtitle}</p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() =>
                      void runWithToast(() => refreshThreads(loadState), {
                        loading: t.toast.refreshingThreads,
                        success: t.toast.refreshedThreads,
                        error: t.toast.refreshThreadsFailed
                      })
                    }
                  >
                    {t.refresh}
                  </button>
                </div>
                <ThreadList
                  environment={selectedEnvironment}
                  threads={environmentSessions}
                  bots={environmentBots}
                  selectedThreadId={selectedThread?.sessionKey ?? selectedThread?.id ?? ""}
                  onSelect={setSelectedThreadId}
                  onChanged={loadState}
                  runWithToast={runWithToast}
                  showToast={showToast}
                  t={t}
                />
              </section>
            </aside>

            <main className="conversation-area">
              <section className="panel chat-panel">
                <ChatBox
                  bot={selectedThreadBot}
                  boundBots={selectedThreadBots}
                  thread={selectedThread}
                  onSent={loadState}
                  onReload={loadState}
                  runWithToast={runWithToast}
                  t={t}
                />
              </section>
            </main>

            <aside className="inspector">
              <section className="panel inspector-panel">
                <h2>{t.environmentOverview}</h2>
                <EnvironmentPanel
                  environment={selectedEnvironment}
                  state={state}
                  selectedThread={selectedThread}
                  canDeleteEnvironment={state.environments.length > 1}
                  onDeleted={handleEnvironmentDeleted}
                  onReload={loadState}
                  runWithToast={runWithToast}
                  t={t}
                />
              </section>
            </aside>
          </div>
        </main>
      ) : null}

      {page === "newEnvironment" ? (
        <PageSurface title={t.addEnvironment} description={t.createEnvironmentDescription} scope={t.environment}>
          <CreateEnvironmentPanel
            providers={state.config.providers}
            defaultCwd={state.config.defaultCwd}
            onCreated={(environment) => {
              setSelectedEnvironmentId(environment.id);
              setPage("environment");
              void loadState();
            }}
            runWithToast={runWithToast}
            t={t}
          />
        </PageSurface>
      ) : null}

      {page === "tasks" ? (
        <PageSurface title={t.taskQueue} description={t.pageDescriptions.tasks} scope={selectedEnvironment?.name}>
          <TaskList tasks={environmentTasks} t={t} runWithToast={runWithToast} />
        </PageSurface>
      ) : null}

      {page === "logs" ? (
        <PageSurface title={t.logsTitle} description={t.pageDescriptions.logs} scope={selectedEnvironment?.name}>
          <LogList logs={environmentLogs} t={t} />
        </PageSurface>
      ) : null}

      {page === "settings" ? (
        <PageSurface title={t.globalSettings} description={t.pageDescriptions.settings} scope={t.globalSettings}>
          <GlobalSettingsPage
            state={state}
            selectedEnvironment={selectedEnvironment}
            selectedBotId={selectedBotId}
            selectedTab={settingsTab}
            onSelectBot={setSelectedBotId}
            onSelectTab={setSettingsTab}
            onReload={loadState}
            runWithToast={runWithToast}
            t={t}
          />
        </PageSurface>
      ) : null}
      <ToastView toast={toast} t={t} onDismiss={() => setToast(undefined)} />
    </div>
  );
}

function PageSurface({
  title,
  description,
  scope,
  children
}: {
  title: string;
  description?: string;
  scope?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="page-shell">
      <section className="panel page-panel">
        <div className="page-header">
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          {scope ? <span>{scope}</span> : null}
        </div>
        <div className="page-body">{children}</div>
      </section>
    </main>
  );
}

function EnvironmentSwitcher({
  environments,
  selectedEnvironmentId,
  onSelect,
  onCreate,
  t
}: {
  environments: EnvironmentConfig[];
  selectedEnvironmentId: string;
  onSelect: (environmentId: string) => void;
  onCreate: () => void;
  t: Translations;
}) {
  const selected = findEnvironmentById(environments, selectedEnvironmentId) ?? environments[0];
  const [open, setOpen] = useState(false);
  const switcherRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handlePointerDown(event: PointerEvent) {
      if (!switcherRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <section className="environment-switcher" ref={switcherRef}>
      <button
        className={`environment-trigger ${open ? "open" : ""}`}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="environment-trigger-icon" aria-hidden="true">⌬</span>
        <span className="environment-trigger-name" title={selected?.name ?? t.currentEnvironmentLabel}>
          {selected?.name ?? t.currentEnvironmentLabel}
        </span>
        <span className="environment-trigger-arrow" aria-hidden="true">⌄</span>
      </button>
      {open ? (
        <div className="environment-menu" role="listbox" aria-label={t.currentEnvironmentLabel}>
          {environments.map((environment) => (
            <button
              className={environment.id === selected?.id ? "selected" : ""}
              type="button"
              role="option"
              aria-selected={environment.id === selected?.id}
              key={environment.id}
              onClick={() => {
                setOpen(false);
                onSelect(environment.id);
              }}
            >
              <span>{environment.name}</span>
              {environment.id === selected?.id ? <small>✓</small> : null}
            </button>
          ))}
          <button
            className="environment-menu-create"
            type="button"
            onClick={() => {
              setOpen(false);
              onCreate();
            }}
          >
            {t.addEnvironment}
          </button>
        </div>
      ) : null}
      {selected ? null : <p className="muted">{t.empty.noEnvironments}</p>}
    </section>
  );
}

function EnvironmentPanel({
  environment,
  state,
  selectedThread,
  canDeleteEnvironment,
  onDeleted,
  onReload,
  runWithToast,
  t
}: {
  environment?: EnvironmentConfig;
  state: DashboardState;
  selectedThread?: CodexThreadSummary;
  canDeleteEnvironment: boolean;
  onDeleted: (environmentId: string) => Promise<void>;
  onReload: () => Promise<void>;
  runWithToast: RunWithToast;
  t: Translations;
}) {
  const [name, setName] = useState(environment?.name ?? "");
  const [description, setDescription] = useState(environment?.description ?? "");
  const [defaultCwd, setDefaultCwd] = useState(environment?.defaultCwd ?? "");
  const [enabled, setEnabled] = useState(environment?.enabled ?? true);
  const [isDefault, setIsDefault] = useState(Boolean(environment?.isDefault));
  const [pendingAction, setPendingAction] = useState<string | undefined>();

  useEffect(() => {
    setName(environment?.name ?? "");
    setDescription(environment?.description ?? "");
    setDefaultCwd(environment?.defaultCwd ?? "");
    setEnabled(environment?.enabled ?? true);
    setIsDefault(Boolean(environment?.isDefault));
  }, [environment?.id, environment?.name, environment?.description, environment?.defaultCwd, environment?.enabled, environment?.isDefault]);

  async function saveEnvironment() {
    if (!environment || pendingAction) {
      return;
    }
    setPendingAction("save");
    await runWithToast(
      async () => {
        await checkedFetch(`/api/environments/${encodeURIComponent(environment.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description,
            defaultCwd,
            enabled,
            isDefault
          })
        });
        await onReload();
      },
      {
        loading: t.toast.savingEnvironment,
        success: t.toast.savedEnvironment,
        error: t.toast.saveEnvironmentFailed
      }
    );
    setPendingAction(undefined);
  }

  async function deleteEnvironment() {
    if (!environment || pendingAction || !canDeleteEnvironment) {
      return;
    }
    if (!window.confirm(t.confirmDeleteEnvironment)) {
      return;
    }
    setPendingAction("delete");
    await runWithToast(
      async () => {
        await checkedFetch(`/api/environments/${encodeURIComponent(environment.id)}`, { method: "DELETE" });
        await onDeleted(environment.id);
      },
      {
        loading: t.toast.deletingEnvironment,
        success: t.toast.deletedEnvironment,
        error: t.toast.deleteEnvironmentFailed
      }
    );
    setPendingAction(undefined);
  }

  const sessions = sessionsForEnvironment(state.sessions, environment?.id);
  const tasks = tasksForEnvironment(state.tasks, environment?.id);
  const bots = botsForEnvironment(state.config.bots, environment?.id);

  return (
    <div className="stack">
      {environment ? (
        <>
          <div className="object-summary">
            <div>
              <span>{t.environmentObjects}</span>
              <strong>{sessions.length} {t.threadCount}</strong>
            </div>
            <div>
              <span>{t.feishuBots}</span>
              <strong>{bots.length}</strong>
            </div>
            <div>
              <span>{t.taskQueue}</span>
              <strong>{tasks.length}</strong>
            </div>
          </div>
          <div className="meta-strip">
            <span>{t.boundRouteLabel}</span>
            <strong>{selectedThread ? `${environment.name} / ${selectedThread.title}` : t.noSelection}</strong>
          </div>
          <div className="editor">
            <label>
              <FieldLabel label={t.fields.environmentName} help={t.help.environmentName} />
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              <FieldLabel label={t.fields.environmentDescription} help={t.help.environmentDescription} />
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t.placeholders.environmentDescription}
              />
            </label>
            <label>
              <FieldLabel label={t.fields.environmentProvider} help={t.help.environmentProvider} />
              <input value={t.providerType[environment.providerType]} readOnly />
            </label>
            <label>
              <FieldLabel label={t.fields.environmentDefaultCwd} help={t.help.environmentDefaultCwd} />
              <input
                value={defaultCwd}
                onChange={(event) => setDefaultCwd(event.target.value)}
                placeholder={t.placeholders.defaultCwd}
              />
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
              <span className="checkbox-copy">
                <FieldLabel label={t.fields.environmentEnabled} help={t.help.environmentEnabled} />
              </span>
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />
              <span className="checkbox-copy">
                <FieldLabel label={t.fields.environmentDefault} help={t.help.environmentDefault} />
              </span>
            </label>
            <div className="form-actions">
              <button className="primary-action" disabled={Boolean(pendingAction)} onClick={() => void saveEnvironment()}>
                {pendingAction === "save" ? t.toast.savingEnvironment : t.actions.saveEnvironment}
              </button>
            </div>
          </div>
          <section className="danger-zone">
            <div>
              <h3>{t.dangerZoneTitle}</h3>
              <p>{t.dangerZoneDescription}</p>
            </div>
            <button
                className="danger-link"
                disabled={Boolean(pendingAction) || !canDeleteEnvironment}
                onClick={() => void deleteEnvironment()}
              >
                {pendingAction === "delete" ? t.toast.deletingEnvironment : t.actions.deleteEnvironment}
              </button>
          </section>
        </>
      ) : (
        <p className="muted">{t.empty.noEnvironments}</p>
      )}
    </div>
  );
}

function CreateEnvironmentPanel({
  providers,
  defaultCwd,
  onCreated,
  runWithToast,
  t
}: {
  providers: DashboardState["config"]["providers"];
  defaultCwd: string;
  onCreated: (environment: EnvironmentConfig) => void;
  runWithToast: RunWithToast;
  t: Translations;
}) {
  const firstProvider = providers[0];
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [providerId, setProviderId] = useState(firstProvider?.id ?? "codex");
  const [cwd, setCwd] = useState(defaultCwd);
  const [enabled, setEnabled] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setProviderId((current) => current || providers[0]?.id || "codex");
  }, [providers]);

  async function createEnvironment() {
    if (creating) {
      return;
    }
    setCreating(true);
    const created = await runWithToast(
      async () => {
        const response = await checkedFetch("/api/environments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name || t.environment,
            description: description || undefined,
            defaultCwd: cwd || defaultCwd || undefined,
            providerId,
            enabled
          })
        });
        return (await response.json()) as EnvironmentConfig;
      },
      {
        loading: t.toast.creatingEnvironment,
        success: t.toast.createdEnvironment,
        error: t.toast.createEnvironmentFailed
      }
    );
    setCreating(false);
    if (created) {
      onCreated(created);
    }
  }

  return (
    <div className="form-page">
      <div className="form-grid">
        <label>
          <FieldLabel label={t.fields.environmentName} help={t.help.environmentName} />
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          <FieldLabel label={t.fields.environmentProvider} help={t.help.environmentProvider} />
          <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
            {providers.map((provider) => (
              <option value={provider.id} key={provider.id}>
                {provider.name} / {t.providerType[provider.type]}
              </option>
            ))}
          </select>
        </label>
        <label className="wide">
          <FieldLabel label={t.fields.environmentDescription} help={t.help.environmentDescription} />
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t.placeholders.environmentDescription}
          />
        </label>
        <label className="wide">
          <FieldLabel label={t.fields.environmentDefaultCwd} help={t.help.environmentDefaultCwd} />
          <input
            value={cwd}
            onChange={(event) => setCwd(event.target.value)}
            placeholder={defaultCwd || t.placeholders.defaultCwd}
          />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          <span className="checkbox-copy">
            <FieldLabel label={t.fields.environmentEnabled} help={t.help.environmentEnabled} />
          </span>
        </label>
      </div>
      <div className="form-actions">
        <button disabled={creating} onClick={() => void createEnvironment()}>
          {creating ? t.toast.creatingEnvironment : t.actions.createEnvironment}
        </button>
      </div>
    </div>
  );
}

function GlobalSettingsPage({
  state,
  selectedEnvironment,
  selectedBotId,
  selectedTab,
  onSelectBot,
  onSelectTab,
  onReload,
  runWithToast,
  t
}: {
  state: DashboardState;
  selectedEnvironment?: EnvironmentConfig;
  selectedBotId: string;
  selectedTab: "gateway" | "outputs";
  onSelectBot: (botId: string) => void;
  onSelectTab: (tab: "gateway" | "outputs") => void;
  onReload: () => Promise<void>;
  runWithToast: RunWithToast;
  t: Translations;
}) {
  return (
    <div className="settings-page">
      <nav className="sub-tabs" aria-label={t.globalSettings}>
        <button className={selectedTab === "gateway" ? "active" : ""} onClick={() => onSelectTab("gateway")}>
          {t.gatewaySettings}
        </button>
        <button className={selectedTab === "outputs" ? "active" : ""} onClick={() => onSelectTab("outputs")}>
          {t.channelOutputs}
        </button>
      </nav>
      <div className="settings-content">
        {selectedTab === "gateway" ? (
          <ConfigPanel state={state} onReload={onReload} runWithToast={runWithToast} t={t} />
        ) : (
          <BotList
            environment={selectedEnvironment}
            bots={state.config.bots}
            threads={state.sessions}
            selectedBotId={selectedBotId}
            onSelect={onSelectBot}
            onChanged={onReload}
            runWithToast={runWithToast}
            t={t}
          />
        )}
      </div>
    </div>
  );
}

function ConfigPanel({
  state,
  onReload,
  runWithToast,
  t
}: {
  state: DashboardState;
  onReload: () => Promise<void>;
  runWithToast: RunWithToast;
  t: Translations;
}) {
  const [defaultCwd, setDefaultCwd] = useState(state.config.defaultCwd);
  const [codexCommand, setCodexCommand] = useState(state.config.codex.command);
  const [preferAppServer, setPreferAppServer] = useState(state.config.codex.preferAppServer);
  const [appServerListen, setAppServerListen] = useState(state.config.codex.appServerListen);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDefaultCwd(state.config.defaultCwd);
    setCodexCommand(state.config.codex.command);
    setPreferAppServer(state.config.codex.preferAppServer);
    setAppServerListen(state.config.codex.appServerListen);
  }, [state.config.defaultCwd, state.config.codex]);

  async function save() {
    if (saving) {
      return;
    }
    setSaving(true);
    await runWithToast(
      async () => {
        await checkedFetch("/api/config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            defaultCwd,
            codex: {
              command: codexCommand,
              preferAppServer,
              appServerListen
            }
          })
        });
        await onReload();
      },
      {
        loading: t.toast.savingSettings,
        success: t.toast.savedSettings,
        error: t.toast.saveSettingsFailed
      }
    );
    setSaving(false);
  }

  return (
    <div className="stack">
      <label>
        <FieldLabel label={t.fields.dataDir} help={t.help.dataDir} />
        <input value={state.config.dataDir} readOnly />
      </label>
      <label>
        <FieldLabel label={t.fields.defaultCwd} help={t.help.defaultCwd} />
        <input
          value={defaultCwd}
          onChange={(event) => setDefaultCwd(event.target.value)}
          placeholder={t.placeholders.defaultCwd}
        />
      </label>
      <label>
        <FieldLabel label={t.fields.codexCommand} help={t.help.codexCommand} />
        <input value={codexCommand} onChange={(event) => setCodexCommand(event.target.value)} />
      </label>
      <label>
        <FieldLabel label={t.fields.appServerListen} help={t.help.appServerListen} />
        <input value={appServerListen} onChange={(event) => setAppServerListen(event.target.value)} />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={preferAppServer}
          onChange={(event) => setPreferAppServer(event.target.checked)}
        />
        <span className="checkbox-copy">
          <FieldLabel label={t.fields.preferAppServer} help={t.help.preferAppServer} />
        </span>
      </label>
      <button disabled={saving} onClick={() => void save()}>{t.actions.saveSettings}</button>
    </div>
  );
}

function BotList({
  environment,
  bots,
  threads,
  selectedBotId,
  onSelect,
  onChanged,
  runWithToast,
  t
}: {
  environment?: EnvironmentConfig;
  bots: FeishuBotConfig[];
  threads: CodexThreadSummary[];
  selectedBotId: string;
  onSelect: (botId: string) => void;
  onChanged: () => Promise<void>;
  runWithToast: RunWithToast;
  t: Translations;
}) {
  const newBotDraft = (name: string): Partial<FeishuBotConfig> => ({
    name,
    enabled: false,
    appId: "",
    appSecret: "",
    channelType: "lark",
    runningMessageMode: "queue",
    outputMode: "both",
    allowedOpenIds: [],
    allowedChatIds: []
  });
  const [editing, setEditing] = useState<Partial<FeishuBotConfig>>(() => newBotDraft(t.defaults.botName));
  const [botDrafts, setBotDrafts] = useState<Record<string, FeishuBotConfig>>({});
  const [pendingAction, setPendingAction] = useState<string | undefined>();
  const [editingBotId, setEditingBotId] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const selectedBot = bots.find((bot) => bot.id === editingBotId);

  useEffect(() => {
    setEditing((current) =>
      current.name && !defaultBotNames.includes(current.name)
        ? current
        : { ...current, name: t.defaults.botName }
    );
  }, [t]);

  useEffect(() => {
    setBotDrafts((current) => {
      const next: Record<string, FeishuBotConfig> = {};
      for (const bot of bots) {
        next[bot.id] = current[bot.id] ? { ...bot, ...current[bot.id] } : bot;
      }
      return next;
    });
  }, [bots]);

  useEffect(() => {
    if (editingBotId && !bots.some((bot) => bot.id === editingBotId)) {
      setEditingBotId("");
    }
  }, [bots, editingBotId]);

  async function createBot() {
    if (pendingAction) {
      return;
    }
    setPendingAction("create");
    await runWithToast(
      async () => {
        await checkedFetch("/api/bots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editing.name || t.defaults.botFallbackName,
            channelType: editing.channelType ?? "lark",
            enabled: Boolean(editing.enabled),
            appId: editing.appId || "",
            appSecret: editing.appSecret || "",
            verificationToken: editing.verificationToken || undefined,
            encryptKey: editing.encryptKey || undefined,
            allowedOpenIds: csvToList(editing.allowedOpenIds?.join(",") ?? ""),
            allowedChatIds: csvToList(editing.allowedChatIds?.join(",") ?? ""),
            activeEnvironmentId: environment?.id,
            activeSessionKey: editing.activeSessionKey ?? editing.activeThreadId ?? undefined,
            runningMessageMode: editing.runningMessageMode || "queue",
            outputMode: editing.outputMode || "both"
          })
        });
        await onChanged();
        setEditing(newBotDraft(t.defaults.botName));
        setDrawerOpen(false);
      },
      {
        loading: t.toast.creatingBot,
        success: t.toast.createdBot,
        error: t.toast.createBotFailed
      }
    );
    setPendingAction(undefined);
  }

  function updateBotDraft(botId: string, patch: Partial<FeishuBotConfig>) {
    setBotDrafts((current) => {
      const base = current[botId] ?? bots.find((bot) => bot.id === botId);
      return base ? { ...current, [botId]: { ...base, ...patch } } : current;
    });
  }

  async function saveBot(botId: string) {
    const draft = botDrafts[botId] ?? bots.find((bot) => bot.id === botId);
    if (!draft || pendingAction) {
      return;
    }
    setPendingAction(`save:${botId}`);
    await runWithToast(
      async () => {
        await checkedFetch(`/api/bots/${botId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.name,
            enabled: draft.enabled,
            appId: draft.appId,
            appSecret: draft.appSecret,
            verificationToken: draft.verificationToken || undefined,
            encryptKey: draft.encryptKey || undefined,
            allowedOpenIds: draft.allowedOpenIds,
            allowedChatIds: draft.allowedChatIds,
            activeEnvironmentId: draft.activeEnvironmentId ?? environment?.id,
            activeSessionKey: draft.activeSessionKey ?? draft.activeThreadId ?? undefined,
            runningMessageMode: draft.runningMessageMode,
            outputMode: draft.outputMode
          })
        });
        await onChanged();
      },
      {
        loading: t.toast.savingBot,
        success: t.toast.savedBot,
        error: t.toast.saveBotFailed
      }
    );
    setPendingAction(undefined);
  }

  async function setBotEnabled(bot: FeishuBotConfig, enabled: boolean) {
    if (pendingAction) {
      return;
    }
    setPendingAction(`${enabled ? "enable" : "disable"}:${bot.id}`);
    await runWithToast(
      async () => {
        await checkedFetch(`/api/bots/${bot.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: bot.name,
            enabled,
            appId: bot.appId,
            appSecret: bot.appSecret,
            verificationToken: bot.verificationToken || undefined,
            encryptKey: bot.encryptKey || undefined,
            allowedOpenIds: bot.allowedOpenIds,
            allowedChatIds: bot.allowedChatIds,
            activeEnvironmentId: bot.activeEnvironmentId ?? environment?.id,
            activeSessionKey: bot.activeSessionKey ?? bot.activeThreadId ?? undefined,
            runningMessageMode: bot.runningMessageMode,
            outputMode: bot.outputMode
          })
        });
        await onChanged();
      },
      {
        loading: enabled ? t.toast.savingBot : t.toast.savingBot,
        success: t.toast.savedBot,
        error: t.toast.saveBotFailed
      }
    );
    setPendingAction(undefined);
  }

  async function deleteBot(botId: string) {
    if (pendingAction) {
      return;
    }
    if (!window.confirm(t.confirmDeleteBot)) {
      return;
    }
    setPendingAction(`delete:${botId}`);
    await runWithToast(
      async () => {
        await checkedFetch(`/api/bots/${botId}`, { method: "DELETE" });
        await onChanged();
      },
      {
        loading: t.toast.deletingBot,
        success: t.toast.deletedBot,
        error: t.toast.deleteBotFailed
      }
    );
    setPendingAction(undefined);
  }

  async function testBot(botId: string) {
    if (pendingAction) {
      return;
    }
    setPendingAction(`test:${botId}`);
    await runWithToast(
      async () => {
        await checkedFetch(`/api/bots/${botId}/test`, { method: "POST" });
      },
      {
        loading: t.toast.testingBot,
        success: t.toast.testedBot,
        error: t.toast.testBotFailed
      }
    );
    setPendingAction(undefined);
  }

  async function copyValue(value: string) {
    try {
      await navigator.clipboard?.writeText(value);
    } finally {
      // Toast is intentionally optimistic; clipboard permission failures still leave the value visible.
    }
  }

  const copyField = (value: string) => () =>
    void runWithToast(
      async () => {
        await copyValue(value);
      },
      {
        loading: t.toast.copied,
        success: t.toast.copied,
        error: t.toast.copied
      }
    );

  function CredentialInput({
    label,
    help,
    value,
    onChange,
    secret = false,
    placeholder
  }: {
    label: string;
    help: string;
    value: string;
    onChange: (value: string) => void;
    secret?: boolean;
    placeholder?: string;
  }) {
    return (
      <label>
        <FieldLabel label={label} help={help} />
        <span className="input-with-action">
          <input
            type={secret ? "password" : "text"}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
          />
          <button
            className="ghost icon-copy"
            type="button"
            disabled={!value}
            aria-label={`${t.actions.copy} ${label}`}
            title={`${t.actions.copy} ${label}`}
            onClick={copyField(value)}
          >
            ⧉
          </button>
        </span>
      </label>
    );
  }

  function ChannelSelect({
    value,
    onChange,
    disabled = false
  }: {
    value?: ChannelType;
    onChange: (value: ChannelType) => void;
    disabled?: boolean;
  }) {
    return (
      <label>
        <FieldLabel label={t.fields.channel} help={t.help.channel} />
        <select value={value ?? "lark"} disabled={disabled} onChange={(event) => onChange(event.target.value as ChannelType)}>
          {channelOptions.map((option) => (
            <option value={option.value} disabled={option.disabled} key={option.value}>
              {t.channelType[option.value]}{option.disabled ? ` (${t.options.comingSoon})` : ""}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function LarkCredentialFields({
    draft,
    onPatch
  }: {
    draft: Partial<FeishuBotConfig>;
    onPatch: (patch: Partial<FeishuBotConfig>) => void;
  }) {
    if ((draft.channelType ?? "lark") !== "lark") {
      return null;
    }
    return (
      <>
        <CredentialInput
          label={t.fields.appId}
          help={t.help.appId}
          value={draft.appId ?? ""}
          onChange={(value) => onPatch({ appId: value })}
        />
        <CredentialInput
          label={t.fields.appSecret}
          help={t.help.appSecret}
          value={draft.appSecret ?? ""}
          secret
          onChange={(value) => onPatch({ appSecret: value })}
        />
        <CredentialInput
          label={t.fields.verificationToken}
          help={t.help.verificationToken}
          value={draft.verificationToken ?? ""}
          secret
          onChange={(value) => onPatch({ verificationToken: value || undefined })}
        />
        <CredentialInput
          label={t.fields.encryptKey}
          help={t.help.encryptKey}
          value={draft.encryptKey ?? ""}
          secret
          onChange={(value) => onPatch({ encryptKey: value || undefined })}
        />
        <label>
          <FieldLabel label={t.fields.allowedOpenIds} help={t.help.allowedOpenIds} />
          <input
            value={draft.allowedOpenIds?.join(", ") ?? ""}
            onChange={(event) => onPatch({ allowedOpenIds: csvToList(event.target.value) })}
            placeholder={t.placeholders.allowedUsers}
          />
        </label>
        <label>
          <FieldLabel label={t.fields.allowedChatIds} help={t.help.allowedChatIds} />
          <input
            value={draft.allowedChatIds?.join(", ") ?? ""}
            onChange={(event) => onPatch({ allowedChatIds: csvToList(event.target.value) })}
            placeholder={t.placeholders.allowedChats}
          />
        </label>
      </>
    );
  }

  const botEditor = selectedBot
    ? (() => {
        const draft = botDrafts[selectedBot.id] ?? selectedBot;
        const saving = pendingAction === `save:${selectedBot.id}`;
        return (
          <section className="bot-config-details" key={selectedBot.id}>
            <h3>{t.actions.editBot}</h3>
            <p className="muted">{t.botConfigSummary}</p>
            <div className="editor">
              <ChannelSelect
                value={draft.channelType}
                disabled
                onChange={(channelType) => updateBotDraft(selectedBot.id, { channelType: channelType as FeishuBotConfig["channelType"] })}
              />
              <label>
                <FieldLabel label={t.fields.name} help={t.help.name} />
                <input value={draft.name} onChange={(event) => updateBotDraft(selectedBot.id, { name: event.target.value })} />
              </label>
              <LarkCredentialFields
                draft={draft}
                onPatch={(patch) => updateBotDraft(selectedBot.id, patch)}
              />
              <label>
                <FieldLabel label={t.fields.runningMessages} help={t.help.runningMessages} />
                <select
                  value={draft.runningMessageMode}
                  onChange={(event) =>
                    updateBotDraft(selectedBot.id, {
                      runningMessageMode: event.target.value as FeishuBotConfig["runningMessageMode"]
                    })
                  }
                >
                  <option value="queue">{t.options.queue}</option>
                  <option value="steer">{t.options.steer}</option>
                </select>
              </label>
              <label>
                <FieldLabel label={t.fields.outputMode} help={t.help.outputMode} />
                <select
                  value={draft.outputMode}
                  onChange={(event) =>
                    updateBotDraft(selectedBot.id, {
                      outputMode: event.target.value as FeishuBotConfig["outputMode"]
                    })
                  }
                >
                  <option value="both">{t.options.both}</option>
                  <option value="structured">{t.options.structured}</option>
                  <option value="raw">{t.options.raw}</option>
                </select>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(event) => updateBotDraft(selectedBot.id, { enabled: event.target.checked })}
                />
                <span className="checkbox-copy">
                  <FieldLabel label={t.fields.enabled} help={t.help.enabled} />
                </span>
              </label>
              <div className="button-row">
                <button disabled={Boolean(pendingAction)} onClick={() => void saveBot(selectedBot.id)}>
                  {saving ? t.toast.savingBot : t.actions.saveBot}
                </button>
                <button className="secondary" type="button" disabled={Boolean(pendingAction)} onClick={() => void testBot(selectedBot.id)}>
                  {pendingAction === `test:${selectedBot.id}` ? t.toast.testingBot : t.actions.testBot}
                </button>
              </div>
            </div>
          </section>
        );
      })()
    : null;

  return (
    <div className="stack im-output-page">
      <div className="toolbar-line">
        <div>
          <h3>{t.feishuBots}</h3>
          <p>{t.pageDescriptions.bots}</p>
        </div>
        <button type="button" onClick={() => setDrawerOpen(true)}>
          {t.actions.addBot}
        </button>
      </div>
      <div className="bot-list">
        {bots.map((bot) => (
          <article
            key={bot.id}
            className={`bot-row ${bot.id === selectedBotId || bot.id === editingBotId ? "selected" : ""}`}
          >
            <button
              className="bot-row-main"
              type="button"
              onClick={() => {
                onSelect(bot.id);
                if (editingBotId && editingBotId !== bot.id) {
                  setEditingBotId("");
                }
              }}
            >
              <span className="bot-title-line">
                <span className={`status-dot ${bot.status}`} aria-hidden="true" />
                <span title={bot.name}>{bot.name}</span>
                <small className={`channel-tag ${bot.channelType}`} title={t.channelType[bot.channelType]}>
                  {t.channelType[bot.channelType]}
                </small>
              </span>
              <small className={`status ${bot.status}`}>{t.botStatus[bot.status]}</small>
            </button>
            {bot.statusMessage ? <small className="status-message">{bot.statusMessage}</small> : null}
            <div className="bot-row-actions">
              <button
                className="secondary"
                type="button"
                disabled={Boolean(pendingAction)}
                onClick={() => {
                  onSelect(bot.id);
                  setEditingBotId((current) => (current === bot.id ? "" : bot.id));
                }}
              >
                {t.actions.editBot}
              </button>
              <button
                className="secondary"
                type="button"
                disabled={Boolean(pendingAction)}
                onClick={() => void testBot(bot.id)}
              >
                {pendingAction === `test:${bot.id}` ? t.toast.testingBot : t.actions.testBot}
              </button>
              <button
                className="secondary"
                type="button"
                disabled={Boolean(pendingAction)}
                onClick={() => void setBotEnabled(bot, !bot.enabled)}
              >
                {pendingAction === `enable:${bot.id}` || pendingAction === `disable:${bot.id}`
                  ? t.toast.savingBot
                  : bot.enabled
                    ? t.actions.disableBot
                    : t.actions.enableBot}
              </button>
              <button
                className="secondary danger"
                type="button"
                disabled={Boolean(pendingAction)}
                onClick={() => void deleteBot(bot.id)}
              >
                {pendingAction === `delete:${bot.id}` ? t.toast.deletingBot : t.actions.deleteBot}
              </button>
            </div>
          </article>
        ))}
        {bots.length === 0 ? <p className="muted">{t.empty.noBots}</p> : null}
      </div>

      <div className={`bot-config-grid ${selectedBot ? "" : "single"}`}>
        {botEditor}
      </div>

      {drawerOpen
        ? createPortal(
            <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label={t.actions.addBot} onMouseDown={() => setDrawerOpen(false)}>
              <aside className="config-drawer" onMouseDown={(event) => event.stopPropagation()}>
                <header className="drawer-header">
                  <div>
                    <h2>{t.actions.addBot}</h2>
                    <p>{t.botConfigSummary}</p>
                  </div>
                  <button className="icon-button" type="button" aria-label={t.close} title={t.close} onClick={() => setDrawerOpen(false)}>
                    x
                  </button>
                </header>
                <div className="editor drawer-body drawer-form">
            <label>
              <FieldLabel label={t.fields.name} help={t.help.name} />
              <input value={editing.name ?? ""} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
            </label>
            <ChannelSelect
              value={editing.channelType ?? "lark"}
              onChange={(channelType) => setEditing({ ...editing, channelType: channelType as FeishuBotConfig["channelType"] })}
            />
            <LarkCredentialFields
              draft={editing}
              onPatch={(patch) => setEditing({ ...editing, ...patch })}
            />
                </div>
                <footer className="drawer-footer">
                  <button className="secondary" type="button" disabled={pendingAction === "create"} onClick={() => setDrawerOpen(false)}>
                    {t.close}
                  </button>
                  <button disabled={Boolean(pendingAction)} onClick={() => void createBot()}>
                    {pendingAction === "create" ? t.toast.creatingBot : t.actions.createBot}
                  </button>
                </footer>
              </aside>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function ThreadList({
  environment,
  threads,
  bots,
  selectedThreadId,
  onSelect,
  onChanged,
  runWithToast,
  showToast,
  t
}: {
  environment?: EnvironmentConfig;
  threads: CodexThreadSummary[];
  bots: FeishuBotConfig[];
  selectedThreadId: string;
  onSelect: (threadId: string) => void;
  onChanged: () => Promise<void>;
  runWithToast: RunWithToast;
  showToast: (message: string, tone: Toast["tone"]) => void;
  t: Translations;
}) {
  const [title, setTitle] = useState(t.defaults.threadTitle);
  const [cwd, setCwd] = useState("");
  const [bindBotId, setBindBotId] = useState("");
  const [creating, setCreating] = useState(false);
  const [bindingDrafts, setBindingDrafts] = useState<Record<string, string>>({});
  const [savingBindingId, setSavingBindingId] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [pinnedThreadKeys, setPinnedThreadKeys] = useState<Set<string>>(() => new Set());
  const environmentId = environment?.id ?? "default";
  const selectedThread = findThreadByKey(threads, selectedThreadId);
  const selectedBoundBots = selectedThread ? boundBotsForThread(bots, selectedThread, environmentId) : [];
  const selectedBoundBot = selectedBoundBots[0];
  const selectedBoundBotsLabel = selectedBoundBots.length ? selectedBoundBots.map((bot) => botLabel(bot, t)).join(", ") : t.options.unbound;
  const selectedBindingDraft = hasOwn(bindingDrafts, selectedThreadId)
    ? bindingDrafts[selectedThreadId]
    : selectedBoundBot?.id ?? "";
  const filteredThreads = useMemo(
    () => {
      const query = search.trim().toLowerCase();
      return threads
        .filter((thread) => {
        const boundBots = boundBotsForThread(bots, thread, environmentId);
        const haystack = [
          thread.title,
          thread.cwd,
          thread.firstMessage,
          thread.lastMessage,
          thread.sessionKey,
          thread.nativeSessionId,
          ...boundBots.map((bot) => botLabel(bot, t))
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
        .sort((left, right) => {
          const leftPinned = pinnedThreadKeys.has(left.sessionKey);
          const rightPinned = pinnedThreadKeys.has(right.sessionKey);
          if (leftPinned !== rightPinned) {
            return leftPinned ? -1 : 1;
          }
          return 0;
        });
    },
    [bots, environmentId, pinnedThreadKeys, search, t, threads]
  );

  useEffect(() => {
    setTitle((current) =>
      current && !defaultThreadTitles.includes(current)
        ? current
        : t.defaults.threadTitle
    );
  }, [t]);

  async function createThread() {
    if (creating) {
      return;
    }
    setCreating(true);
    await runWithToast(
      async () => {
        const response = await checkedFetch(`/api/environments/${encodeURIComponent(environmentId)}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            environmentId,
            cwd: cwd || undefined,
            bindBotId: bindBotId || undefined
          })
        });
        const thread = (await response.json()) as CodexThreadSummary;
        onSelect(thread.sessionKey);
        setShowCreate(false);
        await onChanged();
      },
      {
        loading: t.toast.creatingThread,
        success: t.toast.createdThread,
        error: t.toast.createThreadFailed
      }
    );
    setCreating(false);
  }

  async function saveThreadBinding(threadId: string) {
    if (savingBindingId) {
      return;
    }
    setSavingBindingId(threadId);
    const targetThread = findThreadByKey(threads, threadId);
    const sessionKey = targetThread?.sessionKey ?? threadId;
    const botId = (hasOwn(bindingDrafts, threadId)
      ? bindingDrafts[threadId]
      : boundBotsForThread(bots, targetThread ?? threadId, environmentId)[0]?.id) || undefined;
    const saved = await runWithToast(
      async () => {
        await checkedFetch(`/api/environments/${encodeURIComponent(environmentId)}/sessions/${encodeURIComponent(sessionKey)}/binding`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ botId, environmentId })
        });
        await onChanged();
        return true;
      },
      {
        loading: t.toast.savingBinding,
        success: t.toast.savedBinding,
        error: t.toast.saveBindingFailed
      }
    );
    if (saved) {
      setBindingDrafts((current) => {
        const next = { ...current };
        delete next[threadId];
        return next;
      });
    }
    setSavingBindingId(undefined);
  }

  async function copyThreadId(threadId: string) {
    const targetThread = findThreadByKey(threads, threadId);
    const value = targetThread?.sessionKey ?? threadId;
    try {
      await navigator.clipboard?.writeText(value);
      showToast(t.copiedThreadId, "success");
    } catch {
      showToast(value, "success");
    }
  }

  function togglePinnedThread(threadId: string) {
    setPinnedThreadKeys((current) => {
      const next = new Set(current);
      if (next.has(threadId)) {
        next.delete(threadId);
      } else {
        next.add(threadId);
      }
      return next;
    });
  }

  function selectThreadWithKeyboard(event: React.KeyboardEvent, threadId: string) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    onSelect(threadId);
  }

  return (
    <div className="thread-layout">
      <div className="thread-summary-card">
        <div className="thread-summary-main">
          <span>{t.activeThreadLabel}</span>
          <strong title={selectedThread?.title ?? t.noSelection}>{selectedThread?.title ?? t.noSelection}</strong>
          <small>{filteredThreads.length} / {threads.length} {t.threadCount}</small>
        </div>
        {selectedThread ? (
          <p className="thread-summary-line" title={`${selectedThread.cwd || t.empty.noCwd} · ${selectedBoundBotsLabel}`}>
            <span>{selectedThread.cwd || t.empty.noCwd}</span>
            <span>{selectedBoundBotsLabel}</span>
          </p>
        ) : null}
      </div>

      <div className="thread-toolbar">
        {selectedThreadId ? (
          <label className="thread-binding-select">
            <FieldLabel label={t.selectedThreadBinding} help={t.help.threadBinding} />
            <select
              value={selectedBindingDraft}
              onChange={(event) =>
                setBindingDrafts((current) => ({
                  ...current,
                  [selectedThreadId]: event.target.value
                }))
              }
            >
              <option value="">{t.options.unbound}</option>
              {bots.map((bot) => (
                <option value={bot.id} key={bot.id}>
                  {botLabel(bot, t)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="thread-toolbar-actions">
          <button
            className="secondary"
            disabled={!selectedThreadId || Boolean(savingBindingId) || selectedBindingDraft === (selectedBoundBot?.id ?? "")}
            onClick={() => void saveThreadBinding(selectedThreadId)}
          >
            {savingBindingId === selectedThreadId ? t.toast.savingBinding : t.actions.saveBinding}
          </button>
          <button className="secondary" type="button" onClick={() => setShowCreate((current) => !current)}>
            {t.actions.showCreateThread}
          </button>
        </div>
      </div>

      {showCreate ? (
        <div className="create-thread-bar">
          <label>
            <FieldLabel label={t.fields.title} help={t.help.title} />
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            <FieldLabel label={t.fields.workingDirectory} help={t.help.workingDirectory} />
            <input value={cwd} onChange={(event) => setCwd(event.target.value)} placeholder={t.placeholders.useDefaultCwd} />
          </label>
          <label>
            <FieldLabel label={t.fields.bindToBot} help={t.help.bindToBot} />
            <select value={bindBotId} onChange={(event) => setBindBotId(event.target.value)}>
              <option value="">{t.options.doNotBind}</option>
              {bots.map((bot) => (
                <option value={bot.id} key={bot.id}>
                  {botLabel(bot, t)}
                </option>
              ))}
            </select>
          </label>
          <button disabled={creating} onClick={() => void createThread()}>
            {creating ? t.toast.creatingThread : t.actions.createThread}
          </button>
        </div>
      ) : null}

      <label className="thread-search">
        <FieldLabel label={t.fields.threadSearch} help={t.placeholders.threadSearch} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t.placeholders.threadSearch}
        />
      </label>

      <div className="thread-list">
        {filteredThreads.map((thread) => {
          const boundBots = boundBotsForThread(bots, thread, environmentId);
          const selectedKey = selectedThread?.sessionKey ?? selectedThreadId;
          const pinned = pinnedThreadKeys.has(thread.sessionKey);
          return (
            <div
              key={thread.sessionKey}
              className={`thread-row ${thread.sessionKey === selectedKey ? "selected" : ""} ${pinned ? "pinned" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(thread.sessionKey)}
              onKeyDown={(event) => selectThreadWithKeyboard(event, thread.sessionKey)}
              onDoubleClick={() => void copyThreadId(thread.sessionKey)}
              title={thread.sessionKey}
            >
              <span className="thread-row-title">
                <strong title={thread.title}>{thread.title}</strong>
                <span className="thread-row-badges">
                  <small className={`status inline ${thread.status}`}>{t.threadStatus[thread.status]}</small>
                  <small
                    className={`status inline ${boundBots[0] ? boundBots[0].status : "unknown"}`}
                    title={boundBots.length ? boundBots.map((bot) => botLabel(bot, t)).join(", ") : t.options.unbound}
                  >
                    {boundBots.length ? boundBots.map((bot) => botLabel(bot, t)).join(", ") : t.options.unbound}
                  </small>
                </span>
              </span>
              <span className="thread-row-meta">
                <small className="thread-row-cwd" title={thread.cwd ?? t.empty.noCwd}>{thread.cwd ?? t.empty.noCwd}</small>
                <small className="thread-row-source" title={thread.lastActivityAt ? formatTime(thread.lastActivityAt) : providerLabel(thread, t)}>
                  {thread.lastActivityAt ? formatTime(thread.lastActivityAt) : providerLabel(thread, t)}
                </small>
              </span>
              <button
                className={`thread-row-action ${pinned ? "active" : ""}`}
                type="button"
                aria-label={pinned ? t.actions.unpinThread : t.actions.pinThread}
                aria-pressed={pinned}
                title={pinned ? t.actions.unpinThread : t.actions.pinThread}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  togglePinnedThread(thread.sessionKey);
                }}
              >
                {pinned ? "★" : "↑"}
              </button>
            </div>
          );
        })}
        {filteredThreads.length === 0 ? <p className="muted">{t.empty.noThreads}</p> : null}
      </div>
    </div>
  );
}

function ChatBox({
  bot,
  boundBots,
  thread,
  onSent,
  onReload,
  runWithToast,
  t
}: {
  bot?: FeishuBotConfig;
  boundBots: FeishuBotConfig[];
  thread?: CodexThreadSummary;
  onSent: () => Promise<void>;
  onReload: () => Promise<void>;
  runWithToast: RunWithToast;
  t: Translations;
}) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<AttachmentInput[]>([]);
  const [history, setHistory] = useState<CodexThreadMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function loadHistory(options: { silent?: boolean; signal?: AbortSignal } = {}) {
    if (!thread) {
      setHistory([]);
      return;
    }
    if (!options.silent) {
      setHistoryLoading(true);
    }
    try {
      const response = await fetch(
        `/api/environments/${encodeURIComponent(thread.environmentId)}/sessions/${encodeURIComponent(thread.sessionKey)}/messages`,
        { signal: options.signal }
      );
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      const messages = (await response.json()) as CodexThreadMessage[];
      setHistory(messages);
    } catch (error) {
      if (!options.signal?.aborted) {
        setHistory([]);
      }
    } finally {
      if (!options.silent && !options.signal?.aborted) {
        setHistoryLoading(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadHistory({ signal: controller.signal });
    return () => {
      controller.abort();
    };
  }, [thread?.environmentId, thread?.sessionKey]);

  async function refreshConversation() {
    await runWithToast(
      async () => {
        await onReload();
        await loadHistory({ silent: true });
      },
      {
        loading: t.toast.refreshingThreads,
        success: t.toast.refreshedThreads,
        error: t.toast.refreshThreadsFailed
      }
    );
  }

  async function send() {
    if (!thread || !text.trim() || sending) {
      return;
    }
    setSending(true);
    await runWithToast(
      async () => {
        await checkedFetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "web",
            environmentId: thread.environmentId,
            botId: bot?.id,
            sessionKey: thread.sessionKey,
            threadId: thread.id,
            text,
            attachments
          })
        });
        setText("");
        setAttachments([]);
        await onSent();
      },
      {
        loading: t.toast.sendingMessage,
        success: t.toast.sentMessage,
        error: t.toast.sendMessageFailed
      }
    );
    setSending(false);
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || uploading) {
      return;
    }
    setUploading(true);
    await runWithToast(
      async () => {
        const uploaded: AttachmentInput[] = [];
        for (const file of Array.from(files)) {
          const dataBase64 = await fileToBase64(file);
          const response = await checkedFetch("/api/attachments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: file.name,
              mimeType: file.type || undefined,
              dataBase64
            })
          });
          uploaded.push((await response.json()) as AttachmentInput);
        }
        setAttachments((current) => [...current, ...uploaded]);
      },
      {
        loading: t.toast.uploadingAttachments,
        success: t.toast.uploadedAttachments,
        error: t.toast.uploadAttachmentsFailed
      }
    );
    setUploading(false);
  }

  return (
    <>
      <div className="chat-box">
        <ChatHeader
          boundBots={boundBots}
          bot={bot}
          thread={thread}
          t={t}
          refreshing={historyLoading}
          onRefresh={refreshConversation}
          onExpand={() => setExpanded(true)}
        />
        <ChatTimeline
          messages={history}
          historyLoading={historyLoading}
          t={t}
        />
        <ChatComposer
          text={text}
          attachments={attachments}
          thread={thread}
          t={t}
          onTextChange={setText}
          onUploadFiles={uploadFiles}
          onSend={send}
          sending={sending}
          uploading={uploading}
        />
      </div>
      {expanded
        ? createPortal(
            <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t.chatTitle}>
              <section className="chat-modal">
                <header className="modal-header">
                  <div>
                    <h2>{t.chatTitle}</h2>
                    <p>{thread ? thread.title : t.selectOrCreateThread}</p>
                  </div>
                  <button className="secondary" type="button" onClick={() => setExpanded(false)}>
                    {t.close}
                  </button>
                </header>
                <div className="modal-chat-body">
                  <ChatTimeline
                    messages={history}
                    historyLoading={historyLoading}
                    t={t}
                  />
                  <ChatComposer
                    text={text}
                    attachments={attachments}
                    thread={thread}
                    t={t}
                    onTextChange={setText}
                    onUploadFiles={uploadFiles}
                    onSend={send}
                    sending={sending}
                    uploading={uploading}
                  />
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function ChatHeader({
  boundBots,
  bot,
  thread,
  t,
  refreshing,
  onRefresh,
  onExpand
}: {
  boundBots: FeishuBotConfig[];
  bot?: FeishuBotConfig;
  thread?: CodexThreadSummary;
  t: Translations;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  onExpand: () => void;
}) {
  const bindingText = boundBots.length
    ? `${t.selectedSessionBindings}: ${boundBots.map((item) => `${t.channelType[item.channelType]}:${item.name}`).join(", ")}`
    : t.options.unbound;
  return (
    <div className="chat-header">
      <div className="chat-title-block">
        <h2>{t.chatTitle}</h2>
        <p title={thread ? thread.title : t.selectOrCreateThread}>
          {thread ? thread.title : t.selectOrCreateThread}
        </p>
      </div>
      <div className="chat-header-actions">
        <span className={`status inline ${bot ? bot.status : "unknown"}`} title={bindingText}>
          {bindingText}
        </span>
        <button className="secondary chat-refresh-button" type="button" disabled={refreshing} onClick={() => void onRefresh()}>
          {t.refresh}
        </button>
        <button className="icon-button" type="button" aria-label={t.expandChat} title={t.expandChat} onClick={onExpand}>
          ⛶
        </button>
      </div>
    </div>
  );
}

function ChatTimeline({
  messages,
  historyLoading,
  t
}: {
  messages: CodexThreadMessage[];
  historyLoading: boolean;
  t: Translations;
}) {
  const historyRef = useRef<HTMLDivElement>(null);
  const latestMessageKey = messages.at(-1)?.id ?? "";

  useEffect(() => {
    if (historyLoading) {
      return;
    }
    const container = historyRef.current;
    if (!container) {
      return;
    }
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }, [historyLoading, latestMessageKey]);

  return (
    <div className="chat-history" ref={historyRef}>
      {historyLoading ? <p className="muted">{t.loadingHistory}</p> : null}
      {!historyLoading && messages.length === 0 ? <p className="muted">{t.empty.noMessages}</p> : null}
      {messages.map((message) => (
        <HistoryMessage key={message.id} message={message} t={t} />
      ))}
    </div>
  );
}

function HistoryMessage({ message, t }: { message: CodexThreadMessage; t: Translations }) {
  const isUser = message.role === "user";
  const parts = message.parts?.length ? message.parts : [{ type: "text" as const, text: message.text }];
  const textParts = parts.filter((part): part is Extract<(typeof parts)[number], { type: "text" }> => part.type === "text");
  const attachments = [
    ...parts
      .filter((part): part is Extract<(typeof parts)[number], { type: "attachment" }> => part.type === "attachment")
      .map((part) => part.attachment),
    ...(message.parts?.length ? [] : message.attachments ?? [])
  ];
  return (
    <article className={`chat-message ${isUser ? "from-user" : "from-agent"}`}>
      <div className="message-avatar" aria-hidden="true">
        {isUser ? "你" : "C"}
      </div>
      <div className="message-body">
        <header>
          <span>{isUser ? t.userLabel : t.agentLabel}</span>
          <small>{formatTime(message.createdAt)}</small>
        </header>
        {textParts.map((part, index) => (
          <div className="message-bubble" key={`${message.id}-text-${index}`}>
            <p>{part.text}</p>
          </div>
        ))}
        <AttachmentPreview attachments={attachments} t={t} variant="message" />
      </div>
    </article>
  );
}

function ChatComposer({
  text,
  attachments,
  thread,
  t,
  onTextChange,
  onUploadFiles,
  onSend,
  sending,
  uploading
}: {
  text: string;
  attachments: AttachmentInput[];
  thread?: CodexThreadSummary;
  t: Translations;
  onTextChange: (text: string) => void;
  onUploadFiles: (files: FileList | null) => Promise<void>;
  onSend: () => Promise<void>;
  sending: boolean;
  uploading: boolean;
}) {
  return (
    <div className="composer">
      <div className="attachment-bar">
        <label>
          <FieldLabel label={t.fields.attachments} help={t.help.attachments} />
          <input
            type="file"
            multiple
            disabled={uploading}
            onChange={(event) => void onUploadFiles(event.target.files)}
          />
        </label>
        <AttachmentPreview attachments={attachments} t={t} />
      </div>
      <textarea
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder={t.placeholders.instruction}
      />
      <button className="composer-send" disabled={!thread || !text.trim() || sending || uploading} onClick={() => void onSend()}>
        {sending ? t.toast.sendingMessage : t.actions.send}
      </button>
    </div>
  );
}

type PreviewAttachment = AttachmentInput | NonNullable<CodexThreadMessage["attachments"]>[number];

function AttachmentPreview({
  attachments,
  t,
  variant = "composer"
}: {
  attachments: PreviewAttachment[];
  t: Translations;
  variant?: "composer" | "message";
}) {
  if (attachments.length === 0) {
    return null;
  }
  return (
    <div className={`attachment-list ${variant === "message" ? "message-attachments" : ""}`}>
      {attachments.map((attachment) => {
        const src = attachmentUrl(attachment);
        return isImageAttachment(attachment) ? (
          <figure className="attachment-image" key={attachment.id}>
            <a href={src} target="_blank" rel="noreferrer" aria-label={attachment.name || t.imageAlt}>
              <img src={src} alt={attachment.name || t.imageAlt} />
            </a>
            <figcaption>{attachment.name || t.imageAttachment}</figcaption>
          </figure>
        ) : (
          <span className="attachment-chip" key={attachment.id}>
            <span>{t.fileAttachment}</span>
            <strong>{attachment.name}</strong>
          </span>
        );
      })}
    </div>
  );
}

function isImageAttachment(attachment: PreviewAttachment): boolean {
  return attachment.resourceType === "image" || Boolean(attachment.mimeType?.startsWith("image/"));
}

function attachmentUrl(attachment: PreviewAttachment): string {
  if ("dataUrl" in attachment && attachment.dataUrl) {
    return attachment.dataUrl;
  }
  if ("url" in attachment && attachment.url) {
    return attachment.url;
  }
  return `/api/attachments/${encodeURIComponent(attachment.id)}/content`;
}

function TaskList({
  tasks,
  t,
  runWithToast
}: {
  tasks: GatewayTask[];
  t: Translations;
  runWithToast: RunWithToast;
}) {
  const [pendingAction, setPendingAction] = useState<string | undefined>();
  const [selectedTaskLog, setSelectedTaskLog] = useState<
    { task: GatewayTask; content: string } | undefined
  >();

  async function cancel(taskId: string) {
    if (pendingAction) {
      return;
    }
    setPendingAction(`cancel:${taskId}`);
    await runWithToast(
      async () => {
        await checkedFetch(`/api/tasks/${taskId}/cancel`, { method: "POST" });
      },
      {
        loading: t.toast.cancellingTask,
        success: t.toast.cancelledTask,
        error: t.toast.cancelTaskFailed
      }
    );
    setPendingAction(undefined);
  }

  async function approve(taskId: string, approved: boolean) {
    if (pendingAction) {
      return;
    }
    setPendingAction(`${approved ? "approve" : "reject"}:${taskId}`);
    await runWithToast(
      async () => {
        await checkedFetch(`/api/tasks/${taskId}/approval`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approved })
        });
      },
      {
        loading: approved ? t.toast.approvingTask : t.toast.rejectingTask,
        success: approved ? t.toast.approvedTask : t.toast.rejectedTask,
        error: t.toast.approvalFailed
      }
    );
    setPendingAction(undefined);
  }

  async function openTaskLog(task: GatewayTask) {
    if (pendingAction) {
      return;
    }
    setPendingAction(`log:${task.id}`);
    await runWithToast(
      async () => {
        const response = await checkedFetch(`/api/tasks/${task.id}/log`);
        setSelectedTaskLog({
          task,
          content: await response.text()
        });
      },
      {
        loading: t.toast.loadingTaskLog,
        success: t.toast.loadedTaskLog,
        error: t.toast.loadTaskLogFailed
      }
    );
    setPendingAction(undefined);
  }

  return (
    <>
      <div className="task-list">
        {tasks.slice(0, 30).map((task) => (
          <article key={task.id} className="task-row">
            <div>
              <strong>{task.currentStep ?? task.text}</strong>
              <small>{task.providerType ? t.providerType[task.providerType] : task.providerId} · {task.sessionKey}</small>
              <small>
                {t.source[task.source]}
                {task.channelType ? ` · ${t.channelType[task.channelType]}` : ""}
                {task.channelBotId ? ` · ${task.channelBotId}` : ""}
              </small>
              {task.approval ? <small>{task.approval.title}</small> : null}
            </div>
            <span className={`status ${task.status}`}>{t.taskStatus[task.status]}</span>
            {task.approval ? (
              <>
                <button
                  className="secondary"
                  disabled={Boolean(pendingAction)}
                  onClick={() => void approve(task.id, true)}
                >
                  {pendingAction === `approve:${task.id}` ? t.toast.approvingTask : t.actions.approve}
                </button>
                <button
                  className="secondary"
                  disabled={Boolean(pendingAction)}
                  onClick={() => void approve(task.id, false)}
                >
                  {pendingAction === `reject:${task.id}` ? t.toast.rejectingTask : t.actions.reject}
                </button>
              </>
            ) : null}
            <button className="secondary" disabled={Boolean(pendingAction)} onClick={() => void openTaskLog(task)}>
              {pendingAction === `log:${task.id}` ? t.toast.loadingTaskLog : t.actions.log}
            </button>
            {isCancellableTask(task) ? (
              <button className="secondary" disabled={Boolean(pendingAction)} onClick={() => void cancel(task.id)}>
                {pendingAction === `cancel:${task.id}` ? t.toast.cancellingTask : t.actions.cancel}
              </button>
            ) : null}
          </article>
        ))}
        {tasks.length === 0 ? (
          <EmptyTasks t={t} />
        ) : null}
      </div>
      {selectedTaskLog
        ? createPortal(
            <TaskLogModal
              content={selectedTaskLog.content}
              task={selectedTaskLog.task}
              t={t}
              onClose={() => setSelectedTaskLog(undefined)}
            />,
            document.body
          )
        : null}
    </>
  );
}

function TaskLogModal({
  task,
  content,
  t,
  onClose
}: {
  task: GatewayTask;
  content: string;
  t: Translations;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t.logDetailTitle}>
      <section className="log-modal task-log-modal">
        <header className="modal-header">
          <div>
            <h2>{t.logDetailTitle}</h2>
            <p>{task.currentStep ?? task.text}</p>
          </div>
          <button className="secondary" type="button" onClick={onClose}>
            {t.close}
          </button>
        </header>
        <div className="log-detail-body">
          <dl className="log-meta">
            <div>
              <dt>Task</dt>
              <dd>{task.id}</dd>
            </div>
            <div>
              <dt>{t.providerTypeLabel}</dt>
              <dd>{task.providerType ? t.providerType[task.providerType] : task.providerId}</dd>
            </div>
            <div>
              <dt>Session</dt>
              <dd>{task.sessionKey}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{t.taskStatus[task.status]}</dd>
            </div>
          </dl>
          <section>
            <h3>{t.actions.log}</h3>
            <pre className="log-detail-text task-log-text">{content || t.empty.noLogs}</pre>
          </section>
        </div>
      </section>
    </div>
  );
}

function EmptyTasks({ t }: { t: Translations }) {
  return (
    <section className="empty-state task-empty-state">
      <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label={t.emptyTasksTitle}>
        <rect x="18" y="36" width="84" height="56" rx="8" fill="#f3f4f6" stroke="#e5e7eb" />
        <path d="M26 34a8 8 0 0 1 8-8h18l9 10h25a8 8 0 0 1 8 8v4H26z" fill="#e5e7eb" />
        <path d="M42 64h36M42 76h24" stroke="#9ca3af" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <div>
        <h3>{t.emptyTasksTitle}</h3>
        <p>{t.emptyTasksDescription}</p>
      </div>
    </section>
  );
}
function isCancellableTask(task: GatewayTask): boolean {
  return task.status === "queued" || task.status === "running" || task.status === "waiting_approval";
}

function LogList({ logs, t }: { logs: DashboardState["logs"]; t: Translations }) {
  const [selectedLog, setSelectedLog] = useState<DashboardState["logs"][number] | undefined>();
  const [paused, setPaused] = useState(false);
  const [hiddenLogIds, setHiddenLogIds] = useState<Set<string>>(() => new Set());
  const [frozenLogs, setFrozenLogs] = useState<DashboardState["logs"]>([]);
  const currentLogs = logs.filter((log) => !hiddenLogIds.has(log.id)).slice(0, 160);
  const visibleLogs = paused ? frozenLogs : currentLogs;

  function clearVisibleLogs() {
    setHiddenLogIds((current) => {
      const next = new Set(current);
      for (const log of visibleLogs) {
        next.add(log.id);
      }
      return next;
    });
    if (paused) {
      setFrozenLogs([]);
    }
  }

  function togglePause() {
    if (paused) {
      setPaused(false);
      setFrozenLogs([]);
      return;
    }
    setFrozenLogs(currentLogs);
    setPaused(true);
  }

  function downloadLogs() {
    const payload = visibleLogs
      .map((log) => `[${log.createdAt}] [${t.logLevel[log.level]}] ${log.scope ? `[${log.scope}] ` : ""}${log.message}`)
      .join("\n");
    const blob = new Blob([payload], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `local-agent-gateway-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className={`log-console ${paused ? "paused" : ""}`}>
        <div className="log-action-bar">
          <button className="ghost" type="button" onClick={clearVisibleLogs}>
            {t.actions.clearLogs}
          </button>
          <button className="ghost" type="button" onClick={togglePause}>
            {paused ? t.actions.resumeScroll : t.actions.pauseScroll}
          </button>
          <button className="ghost" type="button" onClick={downloadLogs}>
            {t.actions.downloadLogs}
          </button>
        </div>
        <div className="logs">
          {visibleLogs.map((log) => (
            <button className={`log ${log.level}`} key={log.id} type="button" onClick={() => setSelectedLog(log)}>
              <span>{log.createdAt.slice(11, 19)}</span>
              <strong>{t.logLevel[log.level]}</strong>
              <p>{log.message}</p>
            </button>
          ))}
          {visibleLogs.length === 0 ? <p className="muted">{t.empty.noLogs}</p> : null}
        </div>
      </div>
      {selectedLog
        ? createPortal(
            <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t.logDetailTitle}>
              <section className="log-modal">
                <header className="modal-header">
                  <div>
                    <h2>{t.logDetailTitle}</h2>
                    <p>{formatTime(selectedLog.createdAt)}</p>
                  </div>
                  <button className="secondary" type="button" onClick={() => setSelectedLog(undefined)}>
                    {t.close}
                  </button>
                </header>
                <div className="log-detail-body">
                  <dl className="log-meta">
                    <div>
                      <dt>Level</dt>
                      <dd>{t.logLevel[selectedLog.level]}</dd>
                    </div>
                    {selectedLog.scope ? (
                      <div>
                        <dt>Scope</dt>
                        <dd>{selectedLog.scope}</dd>
                      </div>
                    ) : null}
                    {selectedLog.providerType || selectedLog.providerId ? (
                      <div>
                        <dt>{t.providerTypeLabel}</dt>
                        <dd>{selectedLog.providerType ? t.providerType[selectedLog.providerType] : selectedLog.providerId}</dd>
                      </div>
                    ) : null}
                    {selectedLog.channelType || selectedLog.channelBotId ? (
                      <div>
                        <dt>{t.channelLabel}</dt>
                        <dd>
                          {selectedLog.channelType ? t.channelType[selectedLog.channelType] : "-"}
                          {selectedLog.channelBotId ? ` · ${selectedLog.channelBotId}` : ""}
                        </dd>
                      </div>
                    ) : null}
                    {selectedLog.taskId ? (
                      <div>
                        <dt>Task</dt>
                        <dd>{selectedLog.taskId}</dd>
                      </div>
                    ) : null}
                    {selectedLog.botId ? (
                      <div>
                        <dt>Bot</dt>
                        <dd>{selectedLog.botId}</dd>
                      </div>
                    ) : null}
                    {selectedLog.sessionKey ? (
                      <div>
                        <dt>Session</dt>
                        <dd>{selectedLog.sessionKey}</dd>
                      </div>
                    ) : null}
                    {selectedLog.threadId ? (
                      <div>
                        <dt>Thread</dt>
                        <dd>{selectedLog.threadId}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <section>
                    <h3>Message</h3>
                    <pre className="log-detail-text">{selectedLog.message}</pre>
                  </section>
                  {selectedLog.data !== undefined ? (
                    <section>
                      <h3>Data</h3>
                      <pre className="log-detail-text">{formatLogData(selectedLog.data)}</pre>
                    </section>
                  ) : null}
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function formatLogData(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function ToastView({
  toast,
  t,
  onDismiss
}: {
  toast?: Toast;
  t: Translations;
  onDismiss: () => void;
}) {
  if (!toast) {
    return null;
  }
  return createPortal(
    <div className={`toast ${toast.tone}`} role="status" aria-live="polite">
      <span className="toast-icon" aria-hidden="true" />
      <p>{toast.message}</p>
      <button className="toast-close" type="button" aria-label={t.toast.dismiss} onClick={onDismiss}>
        x
      </button>
    </div>,
    document.body
  );
}

function FieldLabel({ label, help }: { label: string; help: string }) {
  return (
    <span className="field-label">
      <span className="field-label-text" title={label}>
        {label}
      </span>
      <HelpTip text={help} />
    </span>
  );
}

function HelpTip({ text }: { text: string }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  function show() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const tooltipWidth = Math.min(300, window.innerWidth * 0.72);
      const margin = 12;
      const minLeft = tooltipWidth / 2 + margin;
      const maxLeft = window.innerWidth - tooltipWidth / 2 - margin;
      setPosition({
        top: rect.bottom + 8,
        left: Math.min(Math.max(rect.left + rect.width / 2, minLeft), maxLeft)
      });
    }
    setVisible(true);
  }

  function hide() {
    setVisible(false);
    setPinned(false);
  }

  useEffect(() => {
    if (!visible) {
      return;
    }
    function handlePointerDown(event: PointerEvent) {
      if (!buttonRef.current?.contains(event.target as Node)) {
        hide();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        hide();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [visible]);

  return (
    <button
      ref={buttonRef}
      className={`help-tip ${visible ? "is-open" : ""} ${hovered ? "is-hovered" : ""}`}
      type="button"
      aria-label={text}
      aria-expanded={visible}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (visible && pinned) {
          hide();
          return;
        }
        show();
        setPinned(true);
      }}
      onFocus={show}
      onBlur={() => {
        if (!pinned) {
          setVisible(false);
        }
      }}
    >
      <span aria-hidden="true">?</span>
      {visible
        ? createPortal(
            <span
              className="help-popover"
              role="tooltip"
              style={{
                top: position.top,
                left: position.left
              }}
            >
              {text}
            </span>,
            document.body
          )
        : null}
    </button>
  );
}

async function refreshThreads(onReload: () => Promise<void>) {
  await checkedFetch("/api/sessions/refresh", { method: "POST" });
  await onReload();
}

async function checkedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const payload = (await response.json()) as { error?: unknown; message?: unknown };
      detail = String(payload.error ?? payload.message ?? detail);
    } catch {
      // Use the HTTP status text when the response is not JSON.
    }
    throw new Error(`${response.status} ${detail}`.trim());
  }
  return response;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function reduceEvent(state: DashboardState, event: GatewayEvent): DashboardState {
  if (event.type === "config.updated") {
    return { ...state, config: event.config, environments: event.config.environments };
  }
  if (event.type === "environments.updated") {
    return { ...state, environments: event.environments };
  }
  if (event.type === "sessions.updated") {
    return { ...state, sessions: event.sessions, threads: event.sessions };
  }
  if (event.type === "threads.updated") {
    return { ...state, sessions: event.threads, threads: event.threads };
  }
  if (event.type === "task.updated") {
    const without = state.tasks.filter((task) => task.id !== event.task.id);
    return { ...state, tasks: [event.task, ...without] };
  }
  if (event.type === "log") {
    return { ...state, logs: [event.entry, ...state.logs].slice(0, 1000) };
  }
  if (event.type === "bot.status") {
    return {
      ...state,
      config: {
        ...state.config,
        bots: state.config.bots.map((bot) =>
          bot.id === event.botId
            ? { ...bot, status: event.status, statusMessage: event.statusMessage }
            : bot
        )
      }
    };
  }
  return state;
}

function normalizeDashboardState(state: DashboardState): DashboardState {
  const sessions = state.sessions?.length ? state.sessions : state.threads ?? [];
  const environments = state.environments?.length
    ? state.environments
    : state.config.environments?.length
      ? state.config.environments
      : [fallbackEnvironment];
  return {
    ...state,
    environments,
    config: {
      ...state.config,
      environments,
      defaultEnvironmentId: state.config.defaultEnvironmentId || environments[0]?.id || "default"
    },
    sessions,
    threads: sessions
  };
}

createRoot(document.getElementById("root")!).render(<App />);

function getInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(localeStorageKey);
    if (stored === "zh" || stored === "en") {
      return stored;
    }
  } catch {
    // Ignore localStorage failures and fall back to Chinese.
  }
  return "zh";
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function findThreadByKey(
  threads: CodexThreadSummary[],
  key?: string
): CodexThreadSummary | undefined {
  if (!key) {
    return undefined;
  }
  return threads.find(
    (thread) =>
      thread.sessionKey === key ||
      thread.id === key ||
      thread.nativeSessionId === key ||
      thread.providerThreadId === key
  );
}

function findEnvironmentById(
  environments: EnvironmentConfig[],
  environmentId?: string
): EnvironmentConfig | undefined {
  if (!environmentId) {
    return undefined;
  }
  return environments.find((environment) => environment.id === environmentId);
}

function findOperationalEnvironment(
  environments: EnvironmentConfig[],
  sessions: CodexThreadSummary[],
  bots: FeishuBotConfig[],
  preferredEnvironmentId?: string
): EnvironmentConfig | undefined {
  const preferred = findEnvironmentById(environments, preferredEnvironmentId);
  if (preferred && sessionsForEnvironment(sessions, preferred.id).length > 0) {
    return preferred;
  }
  const botEnvironment = environments.find((environment) =>
    bots.some((bot) => {
      const activeKey = bot.activeSessionKey ?? bot.activeThreadId;
      return (
        (bot.activeEnvironmentId || "default") === environment.id &&
        Boolean(activeKey && findThreadByKey(sessionsForEnvironment(sessions, environment.id), activeKey))
      );
    })
  );
  if (botEnvironment) {
    return botEnvironment;
  }
  return environments.find((environment) => sessionsForEnvironment(sessions, environment.id).length > 0) ?? preferred;
}

function sessionsForEnvironment(
  sessions: CodexThreadSummary[],
  environmentId?: string
): CodexThreadSummary[] {
  if (!environmentId) {
    return sessions;
  }
  return sessions.filter((session) => (session.environmentId || "default") === environmentId);
}

function tasksForEnvironment(tasks: GatewayTask[], environmentId?: string): GatewayTask[] {
  if (!environmentId) {
    return tasks;
  }
  return tasks.filter((task) => (task.environmentId || "default") === environmentId);
}

function logsForEnvironment(logs: DashboardState["logs"], environmentId?: string): DashboardState["logs"] {
  if (!environmentId) {
    return logs;
  }
  return logs.filter((log) => !log.environmentId || log.environmentId === environmentId);
}

function botsForEnvironment(
  bots: FeishuBotConfig[],
  environmentId?: string
): FeishuBotConfig[] {
  if (!environmentId) {
    return bots;
  }
  return bots.filter((bot) => (bot.activeEnvironmentId || "default") === environmentId);
}

function preferredSessionKeyForEnvironment(
  bots: FeishuBotConfig[],
  sessions: CodexThreadSummary[]
): string | undefined {
  for (const bot of bots) {
    const activeKey = bot.activeSessionKey ?? bot.activeThreadId;
    const session = findThreadByKey(sessions, activeKey);
    if (session) {
      return session.sessionKey;
    }
  }
  return undefined;
}

function providerLabel(thread: CodexThreadSummary, t: Translations): string {
  const providerType = t.providerType[thread.providerType] ?? thread.providerType;
  const runtime = thread.provider ?? thread.source;
  return `${providerType} / ${runtime}`;
}

function botLabel(bot: FeishuBotConfig, t: Translations): string {
  return `${t.channelType[bot.channelType]} / ${bot.name}`;
}

function csvToList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function boundBotsForThread(
  bots: FeishuBotConfig[],
  threadOrKey?: CodexThreadSummary | string,
  environmentId?: string
): FeishuBotConfig[] {
  if (!threadOrKey) {
    return [];
  }
  const keys =
    typeof threadOrKey === "string"
      ? new Set([threadOrKey])
      : new Set([
          threadOrKey.sessionKey,
          threadOrKey.id,
          threadOrKey.nativeSessionId,
          threadOrKey.providerThreadId
        ].filter((value): value is string => Boolean(value)));
  return bots.filter((bot) => {
    const activeKey = bot.activeSessionKey ?? bot.activeThreadId;
    const botEnvironmentId = bot.activeEnvironmentId || "default";
    return Boolean(activeKey && keys.has(activeKey) && (!environmentId || botEnvironmentId === environmentId));
  });
}

function hasOwn<T extends object>(value: T, key: PropertyKey): key is keyof T {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.includes(",") ? value.split(",")[1] : value);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
