/**
 * 消息发送工具模块
 * 提供钉钉消息发送相关的 5 个工具
 */

import type { DingtalkClient } from "../dingtalk/client.js";
import type { ToolModule, ToolDefinition, ToolHandler } from "./types.js";

/** 工具定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: "send_dingtalk_message",
    description: "向指定员工发送钉钉消息",
    command: "send_dingtalk_message",
    parameters: {
      type: "object",
      properties: {
        user_id: { type: "string", description: "员工ID（staffId）" },
        text: { type: "string", description: "消息文本内容" },
      },
      required: ["user_id", "text"],
    },
  },
  {
    name: "send_group_message",
    description: "向指定群会话发送钉钉消息",
    command: "send_group_message",
    parameters: {
      type: "object",
      properties: {
        conversation_id: { type: "string", description: "群会话ID（openConversationId）" },
        text: { type: "string", description: "消息文本内容" },
      },
      required: ["conversation_id", "text"],
    },
  },
  {
    name: "reply_markdown",
    description: "通过 sessionWebhook 回复 Markdown 格式消息",
    command: "reply_markdown",
    parameters: {
      type: "object",
      properties: {
        webhook: { type: "string", description: "sessionWebhook 地址" },
        title: { type: "string", description: "Markdown 消息标题" },
        text: { type: "string", description: "Markdown 消息正文" },
      },
      required: ["webhook", "title", "text"],
    },
  },
  {
    name: "send_action_card",
    description: "通过 sessionWebhook 发送 ActionCard 卡片消息",
    command: "send_action_card",
    parameters: {
      type: "object",
      properties: {
        webhook: { type: "string", description: "sessionWebhook 地址" },
        title: { type: "string", description: "卡片标题" },
        text: { type: "string", description: "卡片正文（支持 Markdown）" },
        button_title: { type: "string", description: "按钮文字" },
        button_url: { type: "string", description: "按钮跳转链接" },
      },
      required: ["webhook", "title", "text", "button_title", "button_url"],
    },
  },
  {
    name: "send_feed_card",
    description: "通过 sessionWebhook 发送 FeedCard 消息（多条图文链接）",
    command: "send_feed_card",
    parameters: {
      type: "object",
      properties: {
        webhook: { type: "string", description: "sessionWebhook 地址" },
        links: {
          type: "string",
          description: 'JSON 数组字符串，每项包含 title、messageURL、picURL，例如 [{"title":"标题","messageURL":"https://...","picURL":"https://..."}]',
        },
      },
      required: ["webhook", "links"],
    },
  },
];

/**
 * 创建消息工具的处理函数映射
 */
function createHandlers(client: DingtalkClient): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 发送单聊消息
  handlers.set("send_dingtalk_message", async (ctx) => {
    const { user_id, text } = ctx.args;
    try {
      await client.sendToUser(
        [user_id],
        "sampleText",
        JSON.stringify({ content: text })
      );
      return `已成功向用户 ${user_id} 发送消息`;
    } catch (err: any) {
      return `发送消息失败: ${err.message}`;
    }
  });

  // 发送群消息
  handlers.set("send_group_message", async (ctx) => {
    const { conversation_id, text } = ctx.args;
    try {
      await client.sendToGroup(
        conversation_id,
        "sampleText",
        JSON.stringify({ content: text })
      );
      return `已成功向群 ${conversation_id} 发送消息`;
    } catch (err: any) {
      return `发送群消息失败: ${err.message}`;
    }
  });

  // 回复 Markdown
  handlers.set("reply_markdown", async (ctx) => {
    const { webhook, title, text } = ctx.args;
    try {
      await client.replyMarkdown(webhook, title, text);
      return `已成功回复 Markdown 消息「${title}」`;
    } catch (err: any) {
      return `回复 Markdown 失败: ${err.message}`;
    }
  });

  // 发送 ActionCard
  handlers.set("send_action_card", async (ctx) => {
    const { webhook, title, text, button_title, button_url } = ctx.args;
    try {
      await client.replyViaWebhook(webhook, "actionCard", {
        title,
        text,
        singleTitle: button_title,
        singleURL: button_url,
      });
      return `已成功发送 ActionCard「${title}」`;
    } catch (err: any) {
      return `发送 ActionCard 失败: ${err.message}`;
    }
  });

  // 发送 FeedCard
  handlers.set("send_feed_card", async (ctx) => {
    const { webhook, links: linksStr } = ctx.args;
    try {
      const links = JSON.parse(linksStr) as Array<{
        title: string;
        messageURL: string;
        picURL: string;
      }>;
      await client.replyViaWebhook(webhook, "feedCard", { links });
      return `已成功发送 FeedCard，共 ${links.length} 条链接`;
    } catch (err: any) {
      return `发送 FeedCard 失败: ${err.message}`;
    }
  });

  return handlers;
}

export const messagingTools: ToolModule = {
  definitions,
  createHandlers,
};
