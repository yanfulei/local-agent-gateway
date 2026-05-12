import fs from "node:fs/promises";
import type { GatewayTask, TaskMessage } from "../../shared/types.js";

export const LOG_FILE_CHUNK_BYTES = 25 * 1024 * 1024;

export function buildLoadingTaskCard(message: TaskMessage): Record<string, unknown> {
  return buildAgentCard({
    title: "🚀 正在处理中，请稍候...",
    template: "wathet",
    markdown: "Agent 已收到请求，正在读取上下文并执行任务。",
    summary: `正在处理：${message.text}`,
    subtitle: cardSubtitle({
      environmentId: message.environmentId,
      providerType: message.providerType,
      sessionKey: message.sessionKey
    }),
    tags: cardTags({
      providerType: message.providerType,
      environmentId: message.environmentId,
      status: "running"
    }),
    icon: statusIcon("running"),
    sourceText: message.text,
    phaseText: "正在读取上下文并执行任务",
    actions: taskCardActions({
      taskId: message.id,
      chatId: message.feishu?.chatId,
      retryEnabled: false
    })
  });
}

export function buildTaskCard(task: GatewayTask, outputMode: "structured" | "raw" | "both"): Record<string, unknown> {
  const body = task.error && task.status === "failed"
    ? task.error
    : outputMode === "structured"
      ? task.summary || task.error || "任务已更新。"
      : task.summary || task.error || runningFallback(task);
  const approval = task.approval && task.status === "waiting_approval" ? approvalMarkdown(task) : "";
  return buildAgentCard({
    title: taskCardTitle(task),
    template: statusTemplate(task.status),
    markdown: approval || body,
    summary: cardSummaryForTask(task, approval || body),
    subtitle: cardSubtitle(task),
    tags: cardTags(task),
    icon: statusIcon(task.status),
    sourceText: task.text,
    phaseText: isTerminalTaskStatus(task.status) ? undefined : runningPhase(task),
    actions: [
      ...(task.approval && task.status === "waiting_approval"
        ? approvalActions(task)
        : []),
      ...taskCardActions({
        taskId: task.id,
        chatId: task.feishu?.chatId,
        retryEnabled: isTerminalTaskStatus(task.status)
      }),
      ...(isCancellableTaskStatus(task.status)
        ? [
            cardButton(
              "取消任务",
              "danger",
              {
                action: "cancel_task",
                taskId: task.id,
                chatId: task.feishu?.chatId
              },
              {
                title: "取消任务",
                text: "将向本地 Agent 发送取消请求。已结束的任务不会显示此按钮。"
              },
              {
                iconToken: "close_outlined",
                iconColor: "red",
                hoverTips: "请求取消当前任务"
              }
            )
          ]
        : [])
    ]
  });
}

function buildAgentCard(input: {
  title: string;
  template: string;
  markdown: string;
  summary?: string;
  subtitle?: string;
  tags?: Array<{ text: string; color: string }>;
  icon?: { token: string; color?: string };
  sourceText?: string;
  phaseText?: string;
  actions: Array<Record<string, unknown>>;
}): Record<string, unknown> {
  const content = truncate(cleanCardMarkdown(input.markdown), TASK_CARD_OUTPUT_LIMIT) || "暂无输出。";
  const elements = [
    input.sourceText
      ? markdownElement(`> 来自：${truncate(cleanSingleLine(input.sourceText), 180)}`)
      : undefined,
    input.phaseText
      ? markdownElement(`**当前阶段**：${truncate(cleanSingleLine(input.phaseText), 180)}`)
      : undefined,
    markdownElement(content),
    actionElement(input.actions)
  ].filter((element): element is Record<string, unknown> => Boolean(element));
  return buildCardV2({
    title: input.title,
    template: input.template,
    subtitle: input.subtitle,
    tags: input.tags,
    icon: input.icon,
    summary: input.summary ?? content,
    elements
  });
}

function buildCardV2(input: {
  title: string;
  template: string;
  subtitle?: string;
  tags?: Array<{ text: string; color: string }>;
  icon?: { token: string; color?: string };
  summary?: string;
  elements: Array<Record<string, unknown>>;
}): Record<string, unknown> {
  return {
    schema: "2.0",
    config: {
      update_multi: true,
      width_mode: "fill",
      enable_forward_interaction: false,
      summary: {
        content: truncateSummary(input.summary || input.title)
      }
    },
    header: {
      title: {
        tag: "plain_text",
        content: input.title
      },
      ...(input.subtitle
        ? {
            subtitle: {
              tag: "plain_text",
              content: input.subtitle
            }
          }
        : {}),
      ...(input.tags && input.tags.length > 0
        ? {
            text_tag_list: input.tags.slice(0, 3).map((tag) => ({
              tag: "text_tag",
              text: {
                tag: "plain_text",
                content: truncate(cleanSingleLine(tag.text), 20)
              },
              color: tag.color
            }))
          }
        : {}),
      ...(input.icon
        ? {
            icon: {
              tag: "standard_icon",
              token: input.icon.token,
              ...(input.icon.color ? { color: input.icon.color } : {})
            }
          }
        : {}),
      template: input.template,
      padding: "12px"
    },
    body: {
      direction: "vertical",
      padding: "12px 12px 12px 12px",
      vertical_spacing: "8px",
      elements: input.elements.filter((element) => {
        if (element.tag !== "column_set") {
          return true;
        }
        return Array.isArray(element.columns) && element.columns.length > 0;
      })
    }
  };
}

function markdownElement(content: string, elementId?: string): Record<string, unknown> {
  return {
    tag: "markdown",
    ...(elementId ? { element_id: elementId } : {}),
    content
  };
}

function actionElement(actions: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    tag: "column_set",
    flex_mode: "none",
    horizontal_align: "right",
    horizontal_spacing: "8px",
    margin: "12px 0px 0px 0px",
    columns: actions.map((action) => ({
      tag: "column",
      width: "auto",
      padding: "0px 0px 0px 0px",
      vertical_spacing: "8px",
      elements: [action]
    }))
  };
}

function approvalActions(task: GatewayTask): Array<Record<string, unknown>> {
  return [
    cardButton(
      "同意",
      "primary",
      {
        action: "approve_task",
        taskId: task.id
      },
      {
        title: "同意执行",
        text: "确认后本地 Agent 将继续执行该操作。"
      },
      {
        iconToken: "check_outlined",
        iconColor: "green",
        hoverTips: "允许本地 Agent 继续执行"
      }
    ),
    cardButton(
      "拒绝",
      "danger",
      {
        action: "reject_task",
        taskId: task.id
      },
      {
        title: "拒绝执行",
        text: "确认后本地 Agent 将收到拒绝结果。"
      },
      {
        iconToken: "close_outlined",
        iconColor: "red",
        hoverTips: "拒绝本次高风险操作"
      }
    )
  ];
}

function taskCardActions(input: {
  taskId: string;
  chatId?: string;
  retryEnabled: boolean;
}): Array<Record<string, unknown>> {
  const actions = [
    cardButton(
      "查看日志",
      "default",
      {
        action: "view_log",
        taskId: input.taskId,
        chatId: input.chatId
      },
      undefined,
      {
        iconToken: "history_outlined",
        hoverTips: "发送日志摘要和完整 Markdown 日志文件"
      }
    )
  ];
  if (input.retryEnabled) {
    actions.push(
      cardButton(
        "重试",
        "default",
        {
          action: "retry_task",
          taskId: input.taskId,
          chatId: input.chatId
        },
        {
          title: "重新执行任务",
          text: "将按原始输入重新向本地 Agent 派发一次任务。"
        },
        {
          iconToken: "refresh_outlined",
          hoverTips: "使用原始输入重新执行"
        }
      )
    );
  }
  return actions;
}

function cardButton(
  text: string,
  type: "default" | "primary" | "danger",
  value: Record<string, unknown>,
  confirm?: { title: string; text: string },
  options: {
    iconToken?: string;
    iconColor?: string;
    hoverTips?: string;
    disabled?: boolean;
    disabledTips?: string;
  } = {}
): Record<string, unknown> {
  return {
    tag: "button",
    text: {
      tag: "plain_text",
      content: text
    },
    type: buttonTypeV2(type),
    width: "default",
    size: "medium",
    ...(options.iconToken
      ? {
          icon: {
            tag: "standard_icon",
            token: options.iconToken,
            ...(options.iconColor ? { color: options.iconColor } : {})
          }
        }
      : {}),
    ...(options.hoverTips
      ? {
          hover_tips: {
            tag: "plain_text",
            content: options.hoverTips
          }
        }
      : {}),
    ...(options.disabled
      ? {
          disabled: true,
          disabled_tips: {
            tag: "plain_text",
            content: options.disabledTips ?? "当前状态不可操作"
          }
        }
      : {}),
    ...(confirm
      ? {
          confirm: {
            title: { tag: "plain_text", content: confirm.title },
            text: { tag: "plain_text", content: confirm.text }
          }
        }
      : {}),
    behaviors: [
      {
        type: "callback",
        value
      }
    ]
  };
}

function buttonTypeV2(type: "default" | "primary" | "danger"): string {
  if (type === "primary") {
    return "primary_filled";
  }
  if (type === "danger") {
    return "danger";
  }
  return "default";
}

export function buildTaskLogCard(task: GatewayTask, logContent: string, fileCount: number): Record<string, unknown> {
  const preview = logPreview(task, logContent);
  const shownLog = truncate(preview, LOG_CARD_TAIL_LIMIT);
  const elements: Array<Record<string, unknown>> = [
    markdownElement(
      [
        `**任务**：${truncate(cleanSingleLine(task.text), 700)}`,
        `**状态**：${statusLabel(task.status)}`,
        `**会话**：${shortSessionKey(task.sessionKey)}`,
        task.currentStep ? `**步骤**：${cleanSingleLine(task.currentStep)}` : undefined,
        "",
        `**日志预览**（最后 ${LOG_CARD_TAIL_LINES} 行）`,
        "```text",
        escapeCodeFence(shownLog || "日志为空。"),
        "```",
        "",
        fileCount > 1
          ? `完整日志已整理为 ${fileCount} 个 Markdown 文件发送。`
          : "完整日志已整理为 Markdown 文件发送。"
      ].filter((part): part is string => part !== undefined).join("\n")
    )
  ];

  return buildCardV2({
    title: "Local Agent Gateway · 任务日志",
    template: "blue",
    subtitle: cardSubtitle(task),
    tags: cardTags(task),
    icon: {
      token: "history_outlined",
      color: "blue"
    },
    summary: `任务日志：${task.text}`,
    elements
  });
}

function approvalMarkdown(task: GatewayTask): string {
  const approval = task.approval;
  if (!approval) {
    return "";
  }
  const parts = [`**审批**\n${approval.title}`];
  if (approval.description) {
    parts.push(`原因: ${truncate(approval.description, 500)}`);
  }
  if (approval.command) {
    parts.push(`命令: \`${truncate(approval.command, 500)}\``);
  }
  if (approval.diff) {
    parts.push(`Diff: ${truncate(approval.diff, 900)}`);
  }
  return parts.join("\n");
}

function taskCardTitle(task: GatewayTask): string {
  if (task.status === "completed") {
    return "✅ 任务已完成";
  }
  if (task.status === "failed") {
    return "❌ 执行异常";
  }
  if (task.status === "cancelled") {
    return "❌ 任务已取消";
  }
  if (task.status === "waiting_approval") {
    return "⏳ 等待确认";
  }
  return "🚀 正在处理...";
}

function runningFallback(task: GatewayTask): string {
  if (task.summary?.trim()) {
    return task.summary;
  }
  if (task.currentStep) {
    return `正在执行：${task.currentStep}`;
  }
  return "🚀 正在处理中，请稍候...";
}

export function statusLabel(status: GatewayTask["status"]): string {
  const labels: Record<GatewayTask["status"], string> = {
    queued: "排队中",
    running: "运行中",
    waiting_approval: "等待确认",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消"
  };
  return labels[status];
}

function statusTemplate(status: GatewayTask["status"]): string {
  if (status === "completed") {
    return "green";
  }
  if (status === "failed" || status === "cancelled") {
    return "red";
  }
  if (status === "waiting_approval") {
    return "orange";
  }
  return "wathet";
}

function statusIcon(status: GatewayTask["status"] | "running"): { token: string; color?: string } {
  if (status === "completed") {
    return { token: "check_outlined", color: "green" };
  }
  if (status === "failed") {
    return { token: "warning_outlined", color: "red" };
  }
  if (status === "cancelled") {
    return { token: "close_outlined", color: "red" };
  }
  if (status === "waiting_approval") {
    return { token: "maybe_outlined", color: "orange" };
  }
  return { token: "loading_outlined", color: "blue" };
}

function cardSubtitle(input: Pick<GatewayTask, "environmentId" | "providerType" | "sessionKey"> & Partial<Pick<GatewayTask, "startedAt" | "completedAt" | "createdAt">>): string {
  const parts = [
    `环境 ${input.environmentId}`,
    providerLabel(input.providerType),
    `会话 ${shortSessionKey(input.sessionKey)}`
  ];
  const duration = taskDurationText(input);
  if (duration) {
    parts.push(duration);
  }
  return parts.join(" · ");
}

function cardTags(input: Pick<GatewayTask, "providerType" | "environmentId"> & Partial<Pick<GatewayTask, "status" | "attachments">>): Array<{ text: string; color: string }> {
  const tags = [
    {
      text: providerLabel(input.providerType),
      color: "blue"
    },
    {
      text: input.environmentId,
      color: "neutral"
    }
  ];
  if (input.status) {
    tags.push({
      text: statusLabel(input.status),
      color: statusTagColor(input.status)
    });
  }
  const attachmentCount = input.attachments?.length ?? 0;
  if (attachmentCount > 0) {
    tags.push({
      text: `${attachmentCount} 附件`,
      color: "purple"
    });
  }
  return tags.slice(0, 3);
}

function statusTagColor(status: GatewayTask["status"]): string {
  if (status === "completed") {
    return "green";
  }
  if (status === "failed" || status === "cancelled") {
    return "red";
  }
  if (status === "waiting_approval") {
    return "orange";
  }
  return "wathet";
}

function providerLabel(providerType: GatewayTask["providerType"]): string {
  const labels: Record<GatewayTask["providerType"], string> = {
    codex: "Codex",
    "claude-code": "Claude Code",
    openclaw: "OpenClaw",
    hermes: "Hermes"
  };
  return labels[providerType] ?? providerType;
}

function shortSessionKey(sessionKey: string): string {
  const normalized = sessionKey.replace(/^.*:/, "");
  if (normalized.length <= 8) {
    return normalized;
  }
  return `${normalized.slice(0, 4)}…${normalized.slice(-4)}`;
}

function taskDurationText(input: Partial<Pick<GatewayTask, "createdAt" | "startedAt" | "completedAt">>): string | undefined {
  const startedAt = input.startedAt ?? input.createdAt;
  const endedAt = input.completedAt;
  if (!startedAt || !endedAt) {
    return undefined;
  }
  const durationMs = Date.parse(endedAt) - Date.parse(startedAt);
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return undefined;
  }
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  if (durationMs < 60_000) {
    return `${Math.round(durationMs / 1000)}s`;
  }
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return `${minutes}m${seconds}s`;
}

function runningPhase(task: GatewayTask): string {
  if (task.status === "queued") {
    return "排队等待本地 Agent 执行";
  }
  if (task.status === "waiting_approval") {
    return task.approval?.title ?? "等待确认";
  }
  return task.currentStep || "正在执行任务";
}

export function isTerminalTaskStatus(status: GatewayTask["status"]): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function isCancellableTaskStatus(status: GatewayTask["status"]): boolean {
  return status === "queued" || status === "running" || status === "waiting_approval";
}

export function cardUpdateDelayMs(task: GatewayTask): number {
  if (!task.feishu?.cardMessageId) {
    return 0;
  }
  return isTerminalTaskStatus(task.status) || task.status === "waiting_approval" ? 250 : 1800;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function truncateSummary(text: string): string {
  const cleaned = cleanCardMarkdown(text).replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "Local Agent Gateway";
  }
  return cleaned.length > CARD_SUMMARY_LIMIT
    ? `${cleaned.slice(0, CARD_SUMMARY_LIMIT - 1)}…`
    : cleaned;
}

function cleanSingleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function cardSummaryForTask(task: GatewayTask, content: string): string {
  if (task.status === "completed") {
    return content || "任务已完成";
  }
  if (task.status === "failed") {
    return task.error || "执行异常";
  }
  if (task.status === "cancelled") {
    return "任务已取消";
  }
  if (task.status === "waiting_approval") {
    return task.approval?.title || "等待确认";
  }
  return task.currentStep || "正在处理中";
}

function cleanCardMarkdown(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const wholeFence = normalized.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```$/);
  if (!wholeFence) {
    return normalized;
  }
  const inner = wholeFence[1]?.trim() ?? "";
  if (!inner.includes("```")) {
    return inner;
  }
  return normalized;
}

function logPreview(task: GatewayTask, logContent: string): string {
  if (task.status === "failed" && task.error?.trim()) {
    return tailLines(task.error, LOG_CARD_TAIL_LINES);
  }
  return tailLines(logContent || task.summary || task.error || "日志为空。", LOG_CARD_TAIL_LINES);
}

function tailLines(text: string, maxLines: number): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  return lines.slice(-maxLines).join("\n").trim();
}

export function buildTaskLogMarkdown(task: GatewayTask, logContent: string, part: number, totalParts: number): string {
  const title = `# Local Agent Gateway 任务日志`;
  const meta = [
    `- 任务 ID: \`${task.id}\``,
    `- 状态: ${statusLabel(task.status)}`,
    `- Provider: ${providerLabel(task.providerType)}`,
    `- 环境: ${task.environmentId}`,
    `- 会话: \`${task.sessionKey}\``,
    `- 创建时间: ${task.createdAt}`,
    task.startedAt ? `- 开始时间: ${task.startedAt}` : undefined,
    task.completedAt ? `- 完成时间: ${task.completedAt}` : undefined,
    taskDurationText(task) ? `- 耗时: ${taskDurationText(task)}` : undefined,
    totalParts > 1 ? `- 分片: ${part}/${totalParts}` : undefined
  ].filter((line): line is string => Boolean(line));
  return [
    title,
    "",
    "## 原始任务",
    "",
    task.text || "-",
    "",
    "## 元信息",
    "",
    ...meta,
    "",
    "## 日志",
    "",
    "```text",
    escapeCodeFence(logContent || "日志为空。"),
    "```",
    ""
  ].join("\n");
}

export async function readTaskLog(task: GatewayTask): Promise<string> {
  if (task.rawLogPath) {
    try {
      return await fs.readFile(task.rawLogPath, "utf8");
    } catch {
      // Fall back to the structured task fields below.
    }
  }
  return [task.summary, task.error]
    .filter((part): part is string => Boolean(part))
    .join("\n\n")
    .trim();
}

export function splitLogForFiles(text: string): string[] {
  const content = text || "日志为空。\n";
  const buffer = Buffer.from(content);
  if (buffer.length <= LOG_FILE_CHUNK_BYTES) {
    return [content];
  }

  const chunks: string[] = [];
  for (let offset = 0; offset < buffer.length; offset += LOG_FILE_CHUNK_BYTES) {
    chunks.push(buffer.subarray(offset, offset + LOG_FILE_CHUNK_BYTES).toString("utf8"));
  }
  return chunks;
}

function escapeCodeFence(text: string): string {
  return text.replaceAll("```", "`\u200b``");
}

const LOG_CARD_TAIL_LIMIT = 8000;
const LOG_CARD_TAIL_LINES = 40;
const TASK_CARD_OUTPUT_LIMIT = 7000;
const CARD_SUMMARY_LIMIT = 80;
