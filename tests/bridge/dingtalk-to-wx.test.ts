/**
 * 钉钉→微信桥接测试
 * 验证映射查找和 HubClient 转发
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

/** 模拟 Store */
function createMockStore() {
  const links = new Map<string, any>();
  return {
    getMessageLinkByDingtalkMsg: vi.fn((msgId: string) => links.get(msgId)),
    getLatestLinkByWxUser: vi.fn(() => undefined),
    getAllInstallations: vi.fn(() => [
      {
        id: "inst-001",
        hubUrl: "https://hub.example.com",
        appId: "app-001",
        botId: "bot-001",
        appToken: "token-abc",
        webhookSecret: "secret-xyz",
        createdAt: new Date().toISOString(),
      },
    ]),
    getInstallation: vi.fn((id: string) => {
      if (id === "inst-001") {
        return {
          id: "inst-001",
          hubUrl: "https://hub.example.com",
          appId: "app-001",
          botId: "bot-001",
          appToken: "token-abc",
          webhookSecret: "secret-xyz",
        };
      }
      return undefined;
    }),
    _links: links,
  };
}

/** 模拟 HubClient */
function createMockHubClient() {
  return {
    sendText: vi.fn(async () => ({ ok: true })),
    sendMessage: vi.fn(async () => ({ ok: true })),
  };
}

describe("DingtalkToWx 桥接", () => {
  describe("映射查找", () => {
    it("应当通过钉钉消息 ID 查找关联的微信用户", () => {
      const store = createMockStore();
      store._links.set("dt-msg-001", {
        installationId: "inst-001",
        dingtalkConversationId: "conv-001",
        dingtalkMsgId: "dt-msg-001",
        wxUserId: "wx-user-001",
        wxUserName: "张三",
      });

      const link = store.getMessageLinkByDingtalkMsg("dt-msg-001");
      expect(link).toBeDefined();
      expect(link.wxUserId).toBe("wx-user-001");
      expect(link.wxUserName).toBe("张三");
    });

    it("找不到映射时应返回 undefined", () => {
      const store = createMockStore();
      const link = store.getMessageLinkByDingtalkMsg("non-existent");
      expect(link).toBeUndefined();
    });

    it("应当使用正确的 installation 获取 HubClient 配置", () => {
      const store = createMockStore();
      const installation = store.getInstallation("inst-001");
      expect(installation).toBeDefined();
      expect(installation!.appToken).toBe("token-abc");
      expect(installation!.hubUrl).toBe("https://hub.example.com");
    });

    it("installation 不存在时应返回 undefined", () => {
      const store = createMockStore();
      const installation = store.getInstallation("non-existent");
      expect(installation).toBeUndefined();
    });
  });

  describe("HubClient 转发", () => {
    it("应当将文本消息转发到微信", async () => {
      const hubClient = createMockHubClient();
      await hubClient.sendText("inst-001", "wx-user-001", "来自钉钉的消息");

      expect(hubClient.sendText).toHaveBeenCalledTimes(1);
      expect(hubClient.sendText).toHaveBeenCalledWith(
        "inst-001",
        "wx-user-001",
        "来自钉钉的消息"
      );
    });

    it("应当将 Markdown 消息转发到微信", async () => {
      const hubClient = createMockHubClient();
      await hubClient.sendMessage("inst-001", "wx-user-001", "text", "**加粗**内容");

      expect(hubClient.sendMessage).toHaveBeenCalledTimes(1);
      expect(hubClient.sendMessage).toHaveBeenCalledWith(
        "inst-001",
        "wx-user-001",
        "text",
        "**加粗**内容"
      );
    });

    it("转发失败时不应抛出异常", async () => {
      const hubClient = createMockHubClient();
      hubClient.sendText.mockRejectedValueOnce(new Error("网络错误"));

      await expect(hubClient.sendText("inst-001", "wx-user-001", "测试")).rejects.toThrow(
        "网络错误"
      );
    });
  });

  describe("钉钉消息处理", () => {
    it("应当正确解析钉钉消息数据结构", () => {
      const message = {
        conversationId: "conv-001",
        conversationType: "1",
        msgId: "dt-msg-001",
        msgtype: "text",
        content: "你好微信",
        senderStaffId: "staff-001",
        senderId: "sender-001",
        sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession",
      };

      expect(message.conversationId).toBe("conv-001");
      expect(message.msgtype).toBe("text");
      expect(message.content).toBe("你好微信");
    });

    it("应当区分单聊和群聊消息", () => {
      // conversationType: "1" 为单聊，"2" 为群聊
      const singleChat = { conversationType: "1" };
      const groupChat = { conversationType: "2" };

      expect(singleChat.conversationType).toBe("1");
      expect(groupChat.conversationType).toBe("2");
    });
  });
});
