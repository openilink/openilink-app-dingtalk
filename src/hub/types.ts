/**
 * OpeniLink Hub 协议相关类型定义
 */

/** Hub 推送到 App 的事件结构 */
export interface HubEvent {
  /** 协议版本 */
  v: string;
  /** 事件类型：普通事件 或 URL 验证 */
  type: "event" | "url_verification";
  /** 追踪 ID，用于日志串联 */
  trace_id: string;
  /** URL 验证时 Hub 提供的 challenge 值 */
  challenge?: string;
  /** 安装 ID */
  installation_id: string;
  /** 触发事件的 Bot 信息 */
  bot: { id: string };
  /** 具体事件内容 */
  event?: {
    /** 事件类型，如 "message"、"command" */
    type: string;
    /** 事件唯一 ID */
    id: string;
    /** 事件时间戳（毫秒） */
    timestamp: number;
    /** 事件附带的数据 */
    data: Record<string, unknown>;
  };
}

/** 安装信息（持久化） */
export interface Installation {
  /** 安装唯一 ID */
  id: string;
  /** Hub 地址 */
  hubUrl: string;
  /** 应用 ID */
  appId: string;
  /** Bot ID */
  botId: string;
  /** 用于调用 Hub API 的令牌 */
  appToken: string;
  /** 用于验证 webhook 签名的密钥 */
  webhookSecret: string;
  /** 创建时间 */
  createdAt?: string;
}

/** 消息关联记录：钉钉会话消息 <-> 微信用户 */
export interface MessageLink {
  /** 自增 ID */
  id?: number;
  /** 关联的安装 ID */
  installationId: string;
  /** 钉钉会话 ID */
  dingtalkConversationId: string;
  /** 钉钉消息 ID */
  dingtalkMsgId: string;
  /** 微信用户 ID */
  wxUserId: string;
  /** 微信用户昵称 */
  wxUserName: string;
  /** 创建时间 */
  createdAt?: string;
}

/** AI Tool 定义 */
export interface ToolDefinition {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 对应的命令 */
  command: string;
  /** 工具参数 JSON Schema */
  parameters?: Record<string, unknown>;
}

/** Tool 调用时的上下文 */
export interface ToolContext {
  /** 安装 ID */
  installationId: string;
  /** Bot ID */
  botId: string;
  /** 调用用户 ID */
  userId: string;
  /** 追踪 ID */
  traceId: string;
  /** 调用参数 */
  args: Record<string, unknown>;
}

/** Tool 处理结果 — 支持文本和媒体类型 */
export interface ToolResult {
  /** 回复文本 */
  reply: string;
  /** 回复类型，默认 text */
  reply_type?: string;
  /** 媒体 URL */
  reply_url?: string;
  /** 媒体 Base64 */
  reply_base64?: string;
  /** 文件名 */
  reply_name?: string;
}

/** Tool 处理函数签名 */
export type ToolHandler = (ctx: ToolContext) => Promise<string | ToolResult>;
