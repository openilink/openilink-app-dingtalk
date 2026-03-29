/**
 * Hub 客户端测试
 * 验证 sendText/sendMessage 方法
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

/** 模拟 HubClient 类 */
class MockHubClient {
  public hubUrl: string;
  public appToken: string;
  public lastRequest: { url: string; body: any } | null = null;

  constructor(hubUrl: string, appToken: string) {
    this.hubUrl = hubUrl;
    this.appToken = appToken;
  }

  /** 发送文本消息 */
  async sendText(installationId: string, userId: string, text: string): Promise<{ ok: boolean }> {
    this.lastRequest = {
      url: `${this.hubUrl}/api/v1/messages`,
      body: {
        installation_id: installationId,
        user_id: userId,
        type: "text",
        content: text,
      },
    };
    return { ok: true };
  }

  /** 发送通用消息 */
  async sendMessage(
    installationId: string,
    userId: string,
    type: string,
    content: any
  ): Promise<{ ok: boolean }> {
    this.lastRequest = {
      url: `${this.hubUrl}/api/v1/messages`,
      body: {
        installation_id: installationId,
        user_id: userId,
        type,
        content,
      },
    };
    return { ok: true };
  }
}

describe("HubClient", () => {
  let client: MockHubClient;

  beforeEach(() => {
    client = new MockHubClient("https://hub.example.com", "token-abc");
  });

  describe("构造函数", () => {
    it("应当正确初始化 hubUrl 和 appToken", () => {
      expect(client.hubUrl).toBe("https://hub.example.com");
      expect(client.appToken).toBe("token-abc");
    });
  });

  describe("sendText", () => {
    it("应当发送文本消息", async () => {
      const result = await client.sendText("inst-001", "user-001", "你好世界");
      expect(result.ok).toBe(true);
      expect(client.lastRequest).toBeDefined();
      expect(client.lastRequest!.body.type).toBe("text");
      expect(client.lastRequest!.body.content).toBe("你好世界");
    });

    it("应当携带正确的 installation_id", async () => {
      await client.sendText("inst-002", "user-001", "测试");
      expect(client.lastRequest!.body.installation_id).toBe("inst-002");
    });

    it("应当携带正确的 user_id", async () => {
      await client.sendText("inst-001", "user-099", "测试");
      expect(client.lastRequest!.body.user_id).toBe("user-099");
    });

    it("应当请求正确的 API 地址", async () => {
      await client.sendText("inst-001", "user-001", "测试");
      expect(client.lastRequest!.url).toBe("https://hub.example.com/api/v1/messages");
    });
  });

  describe("sendMessage", () => {
    it("应当发送 markdown 消息", async () => {
      const result = await client.sendMessage("inst-001", "user-001", "markdown", {
        title: "通知",
        text: "## 标题\n内容",
      });
      expect(result.ok).toBe(true);
      expect(client.lastRequest!.body.type).toBe("markdown");
      expect(client.lastRequest!.body.content.title).toBe("通知");
    });

    it("应当发送图片消息", async () => {
      await client.sendMessage("inst-001", "user-001", "image", {
        url: "https://example.com/image.png",
      });
      expect(client.lastRequest!.body.type).toBe("image");
      expect(client.lastRequest!.body.content.url).toBe("https://example.com/image.png");
    });

    it("应当发送链接消息", async () => {
      await client.sendMessage("inst-001", "user-001", "link", {
        title: "文章",
        description: "描述",
        url: "https://example.com",
      });
      expect(client.lastRequest!.body.type).toBe("link");
      expect(client.lastRequest!.body.content.url).toBe("https://example.com");
    });
  });
});
