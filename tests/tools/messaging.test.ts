/**
 * 消息工具测试
 * 验证 send/reply 相关 tools
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

/** 模拟钉钉客户端 */
function createMockDingtalkClient() {
  return {
    getAccessToken: vi.fn(async () => "mock-access-token"),
    replyText: vi.fn(async () => ({ ok: true })),
    replyMarkdown: vi.fn(async () => ({ ok: true })),
    replyViaWebhook: vi.fn(async () => ({ ok: true })),
    sendToUser: vi.fn(async () => ({ ok: true })),
    sendToGroup: vi.fn(async () => ({ ok: true })),
  };
}

/** 模拟 messaging tools 定义 */
function createMessagingTools(client: ReturnType<typeof createMockDingtalkClient>) {
  return [
    {
      name: "send_text_message",
      description: "发送文本消息到钉钉用户",
      handler: async (params: { userId: string; content: string }) => {
        return client.sendToUser(params.userId, params.content);
      },
    },
    {
      name: "send_markdown_message",
      description: "发送 Markdown 消息到钉钉用户",
      handler: async (params: { userId: string; title: string; text: string }) => {
        return client.sendToUser(params.userId, params.text);
      },
    },
    {
      name: "reply_text",
      description: "回复文本消息",
      handler: async (params: { sessionWebhook: string; content: string }) => {
        return client.replyViaWebhook(params.sessionWebhook, params.content);
      },
    },
    {
      name: "reply_markdown",
      description: "回复 Markdown 消息",
      handler: async (params: { sessionWebhook: string; title: string; text: string }) => {
        return client.replyViaWebhook(params.sessionWebhook, params.text);
      },
    },
    {
      name: "send_group_message",
      description: "发送消息到钉钉群",
      handler: async (params: { conversationId: string; content: string }) => {
        return client.sendToGroup(params.conversationId, params.content);
      },
    },
  ];
}

describe("Messaging Tools", () => {
  let client: ReturnType<typeof createMockDingtalkClient>;
  let tools: ReturnType<typeof createMessagingTools>;

  beforeEach(() => {
    client = createMockDingtalkClient();
    tools = createMessagingTools(client);
  });

  it("应当注册 5 个消息工具", () => {
    expect(tools).toHaveLength(5);
  });

  describe("send_text_message", () => {
    it("应当调用 sendToUser 发送文本", async () => {
      const tool = tools.find((t) => t.name === "send_text_message")!;
      const result = await tool.handler({ userId: "user-001", content: "测试消息" });

      expect(result.ok).toBe(true);
      expect(client.sendToUser).toHaveBeenCalledWith("user-001", "测试消息");
    });
  });

  describe("send_markdown_message", () => {
    it("应当调用 sendToUser 发送 Markdown", async () => {
      const tool = tools.find((t) => t.name === "send_markdown_message")!;
      await tool.handler({
        userId: "user-001",
        title: "通知标题",
        text: "## 内容\n正文",
      });

      expect(client.sendToUser).toHaveBeenCalledWith("user-001", "## 内容\n正文");
    });
  });

  describe("reply_text", () => {
    it("应当通过 sessionWebhook 回复文本", async () => {
      const tool = tools.find((t) => t.name === "reply_text")!;
      await tool.handler({
        sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession?token=xxx",
        content: "收到",
      });

      expect(client.replyViaWebhook).toHaveBeenCalledWith(
        "https://oapi.dingtalk.com/robot/sendBySession?token=xxx",
        "收到"
      );
    });
  });

  describe("reply_markdown", () => {
    it("应当通过 sessionWebhook 回复 Markdown", async () => {
      const tool = tools.find((t) => t.name === "reply_markdown")!;
      await tool.handler({
        sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession?token=xxx",
        title: "回复",
        text: "**已处理**",
      });

      expect(client.replyViaWebhook).toHaveBeenCalledWith(
        "https://oapi.dingtalk.com/robot/sendBySession?token=xxx",
        "**已处理**"
      );
    });
  });

  describe("send_group_message", () => {
    it("应当调用 sendToGroup 发送群消息", async () => {
      const tool = tools.find((t) => t.name === "send_group_message")!;
      await tool.handler({
        conversationId: "conv-001",
        content: "群消息内容",
      });

      expect(client.sendToGroup).toHaveBeenCalledWith("conv-001", "群消息内容");
    });
  });

  describe("工具元信息", () => {
    it("每个工具应有名称和描述", () => {
      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(tool.name.length).toBeGreaterThan(0);
        expect(tool.description).toBeDefined();
        expect(tool.description.length).toBeGreaterThan(0);
      }
    });

    it("工具名称不应重复", () => {
      const names = tools.map((t) => t.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });
});
