/**
 * 钉钉 Bridge 集成测试
 *
 * 测试 Hub <-> App 的完整通信链路，不依赖钉钉 SDK：
 * 1. Mock Hub Server 模拟 OpeniLink Hub
 * 2. 创建轻量 App HTTP 服务器（仅含 webhook handler）
 * 3. 使用内存 SQLite 存储 + Mock DingtalkClient
 * 4. 验证微信->钉钉和钉钉->微信的双向桥接
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import { Store } from "../../src/store.js";
import { handleWebhook } from "../../src/hub/webhook.js";
import { WxToDingtalk } from "../../src/bridge/wx-to-dingtalk.js";
import { DingtalkToWx } from "../../src/bridge/dingtalk-to-wx.js";
import type { HubEvent } from "../../src/hub/types.js";
import type { DingtalkMessageData } from "../../src/dingtalk/event.js";
import {
  startMockHub,
  injectMessage,
  getMessages,
  resetMock,
  waitFor,
  MOCK_HUB_URL,
  MOCK_WEBHOOK_SECRET,
  MOCK_APP_TOKEN,
  MOCK_INSTALLATION_ID,
  MOCK_BOT_ID,
  APP_PORT,
} from "./setup.js";

// --- Mock DingtalkClient ---
// 模拟钉钉客户端，不连接真实钉钉，仅记录发送的消息

/** 记录钉钉端发送的消息 */
let dingtalkSentMessages: Array<{
  type: string;
  webhook?: string;
  title?: string;
  text?: string;
  userIds?: string[];
  msgKey?: string;
  msgParam?: string;
  conversationId?: string;
}> = [];

/**
 * 创建 Mock DingtalkClient
 * 实现 replyMarkdown / sendToUser / sendToGroup 方法，仅记录调用
 */
function createMockDingtalkClient() {
  return {
    replyMarkdown: async (
      webhook: string,
      title: string,
      text: string,
    ): Promise<void> => {
      dingtalkSentMessages.push({
        type: "replyMarkdown",
        webhook,
        title,
        text,
      });
    },
    sendToUser: async (
      userIds: string[],
      msgKey: string,
      msgParam: string,
    ): Promise<void> => {
      dingtalkSentMessages.push({
        type: "sendToUser",
        userIds,
        msgKey,
        msgParam,
      });
    },
    sendToGroup: async (
      conversationId: string,
      msgKey: string,
      msgParam: string,
    ): Promise<void> => {
      dingtalkSentMessages.push({
        type: "sendToGroup",
        conversationId,
        msgKey,
        msgParam,
      });
    },
  } as any;
}

// --- 测试主体 ---

describe("钉钉 Bridge 集成测试", () => {
  let mockHubHandle: { server: http.Server; close: () => Promise<void> };
  let appServer: http.Server;
  let store: Store;
  let wxToDingtalk: WxToDingtalk;
  let dingtalkToWx: DingtalkToWx;
  const defaultConversationId = "test_conv_001";
  const defaultWebhook = "http://mock-dingtalk/webhook/001";
  const defaultStaffId = "staff_001";

  beforeAll(async () => {
    // 1. 启动 Mock Hub Server
    mockHubHandle = await startMockHub();

    // 2. 初始化内存数据库和存储
    store = new Store(":memory:");

    // 3. 注入 installation 记录（模拟已完成 OAuth 安装）
    store.saveInstallation({
      id: MOCK_INSTALLATION_ID,
      hubUrl: MOCK_HUB_URL,
      appId: "test-app",
      botId: MOCK_BOT_ID,
      appToken: MOCK_APP_TOKEN,
      webhookSecret: MOCK_WEBHOOK_SECRET,
      createdAt: new Date().toISOString(),
    });

    // 4. 创建 Mock DingtalkClient 和桥接模块
    const mockClient = createMockDingtalkClient();
    wxToDingtalk = new WxToDingtalk(mockClient, store);
    dingtalkToWx = new DingtalkToWx(store);

    // 5. 预设 sessionWebhook 缓存（模拟钉钉用户曾发过消息）
    wxToDingtalk.updateWebhookCache(
      defaultConversationId,
      defaultWebhook,
      defaultStaffId,
    );

    // 6. 启动轻量 App HTTP 服务器（只处理 /hub/webhook）
    appServer = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost:${APP_PORT}`);

      if (req.method === "POST" && url.pathname === "/hub/webhook") {
        await handleWebhook(req, res, store, async (event: HubEvent) => {
          if (!event.event) return;
          const eventType = event.event.type;

          if (eventType.startsWith("message.")) {
            // 查找 installation
            const installation = store.getInstallation(event.installation_id);
            if (installation) {
              await wxToDingtalk.handleWxEvent(event, installation);
            }
          }
        });
        return;
      }

      // 健康检查
      if (url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      res.writeHead(404);
      res.end("Not Found");
    });

    await new Promise<void>((resolve, reject) => {
      appServer.on("error", reject);
      appServer.listen(APP_PORT, () => {
        console.log(`[test] App Server 已启动，端口 ${APP_PORT}`);
        resolve();
      });
    });
  });

  afterAll(async () => {
    // 关闭 App 服务器
    await new Promise<void>((resolve) =>
      appServer.close(() => {
        console.log("[test] App Server 已关闭");
        resolve();
      }),
    );

    // 关闭 Mock Hub Server
    await mockHubHandle.close();

    // 关闭数据库
    store.close();
  });

  beforeEach(() => {
    // 每个测试前重置消息记录
    resetMock();
    dingtalkSentMessages = [];
  });

  // --- 微信->钉钉 方向测试 ---

  it("Mock Hub Server 健康检查", async () => {
    const res = await fetch(`${MOCK_HUB_URL}/health`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toEqual({ status: "ok" });
  });

  it("App Server 健康检查", async () => {
    const res = await fetch(`http://localhost:${APP_PORT}/health`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toEqual({ status: "ok" });
  });

  it("微信文本消息应通过 Hub->App->钉钉 链路转发", async () => {
    // 先建立一条微信用户关联记录，使 WxToDingtalk 能找到 conversationId
    store.saveMessageLink({
      installationId: MOCK_INSTALLATION_ID,
      dingtalkConversationId: defaultConversationId,
      dingtalkMsgId: "",
      wxUserId: "user_alice",
      wxUserName: "user_alice",
    });

    // Mock Hub 注入微信消息 -> 转发到 App webhook -> WxToDingtalk 转发到钉钉
    await injectMessage("user_alice", "你好钉钉");

    // 等待 WxToDingtalk 处理完成（钉钉端收到消息）
    await waitFor(async () => dingtalkSentMessages.length > 0, 5000);

    // 验证钉钉端收到了转发的消息
    expect(dingtalkSentMessages.length).toBe(1);
    expect(dingtalkSentMessages[0].type).toBe("replyMarkdown");
    expect(dingtalkSentMessages[0].text).toContain("user_alice");
    expect(dingtalkSentMessages[0].text).toContain("你好钉钉");
  });

  it("多条微信消息应依次转发到钉钉", async () => {
    // 为两个用户建立关联记录
    store.saveMessageLink({
      installationId: MOCK_INSTALLATION_ID,
      dingtalkConversationId: defaultConversationId,
      dingtalkMsgId: "",
      wxUserId: "user_bob",
      wxUserName: "user_bob",
    });
    store.saveMessageLink({
      installationId: MOCK_INSTALLATION_ID,
      dingtalkConversationId: defaultConversationId,
      dingtalkMsgId: "",
      wxUserId: "user_carol",
      wxUserName: "user_carol",
    });

    await injectMessage("user_bob", "第一条消息");
    await injectMessage("user_carol", "第二条消息");

    // 等待两条消息都转发完成
    await waitFor(async () => dingtalkSentMessages.length >= 2, 5000);

    expect(dingtalkSentMessages.length).toBe(2);
    expect(dingtalkSentMessages[0].text).toContain("第一条消息");
    expect(dingtalkSentMessages[1].text).toContain("第二条消息");
  });

  it("消息映射应正确保存到 Store", async () => {
    store.saveMessageLink({
      installationId: MOCK_INSTALLATION_ID,
      dingtalkConversationId: defaultConversationId,
      dingtalkMsgId: "",
      wxUserId: "user_charlie",
      wxUserName: "user_charlie",
    });

    await injectMessage("user_charlie", "测试映射");

    await waitFor(async () => dingtalkSentMessages.length > 0, 5000);

    // 验证 Store 中保存了消息映射
    const link = store.getLatestLinkByWxUser("user_charlie");
    expect(link).toBeDefined();
    expect(link!.wxUserId).toBe("user_charlie");
    expect(link!.installationId).toBe(MOCK_INSTALLATION_ID);
  });

  // --- 钉钉->微信 方向测试 ---

  it("钉钉回复消息应通过 DingtalkToWx->HubClient 转发到微信", async () => {
    // 先保存一条微信->钉钉的消息关联，包含钉钉消息 ID
    const dingtalkMsgId = `dt_msg_${Date.now()}`;
    store.saveMessageLink({
      installationId: MOCK_INSTALLATION_ID,
      dingtalkConversationId: defaultConversationId,
      dingtalkMsgId: dingtalkMsgId,
      wxUserId: "user_dave",
      wxUserName: "user_dave",
    });

    // 模拟钉钉用户回复这条消息
    const dingtalkData: DingtalkMessageData = {
      conversationId: defaultConversationId,
      conversationType: "2",
      msgId: dingtalkMsgId,
      msgtype: "text",
      content: "收到，已处理",
      senderStaffId: defaultStaffId,
      senderId: "dingtalk_user_001",
      sessionWebhook: defaultWebhook,
      createAt: Date.now(),
    };

    // 触发 DingtalkToWx 处理
    const installations = store.getAllInstallations();
    await dingtalkToWx.handleDingtalkMessage(dingtalkData, installations);

    // 等待 HubClient 将消息发送到 Mock Hub
    await waitFor(async () => {
      const msgs = await getMessages();
      return msgs.length > 0;
    }, 5000);

    // 验证 Mock Hub 收到了回复消息
    const hubMessages = await getMessages();
    expect(hubMessages.length).toBe(1);
    expect(hubMessages[0].data.toId).toBe("user_dave");
    expect(hubMessages[0].data.content).toBe("收到，已处理");
  });

  it("钉钉消息未找到关联记录应被保存而非报错", async () => {
    // 模拟一条没有关联记录的钉钉消息
    const orphanData: DingtalkMessageData = {
      conversationId: "unknown_conv",
      conversationType: "2",
      msgId: `dt_orphan_${Date.now()}`,
      msgtype: "text",
      content: "找不到关联的消息",
      senderStaffId: "staff_unknown",
      senderId: "dingtalk_orphan",
      sessionWebhook: "",
      createAt: Date.now(),
    };

    const installations = store.getAllInstallations();
    // 不应抛出异常
    await dingtalkToWx.handleDingtalkMessage(orphanData, installations);

    // Mock Hub 不应收到任何消息（因为找不到关联的微信用户）
    const hubMessages = await getMessages();
    expect(hubMessages.length).toBe(0);
  });

  // --- Webhook 验证测试 ---

  it("无效签名的 webhook 请求应被拒绝（401）", async () => {
    const hubEvent = {
      v: "1",
      type: "event",
      trace_id: "tr_bad_sig",
      installation_id: MOCK_INSTALLATION_ID,
      bot: { id: MOCK_BOT_ID },
      event: {
        type: "message.text",
        id: "evt_bad",
        timestamp: Date.now(),
        data: { from: "hacker", from_name: "hacker", content: "恶意消息" },
      },
    };

    const res = await fetch(`http://localhost:${APP_PORT}/hub/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Timestamp": "12345",
        "X-Hub-Signature": "invalid_signature_here",
      },
      body: JSON.stringify(hubEvent),
    });

    // 应返回 401
    expect(res.status).toBe(401);

    // 钉钉端不应收到任何消息
    expect(dingtalkSentMessages.length).toBe(0);
  });

  it("url_verification 请求应正确返回 challenge", async () => {
    const verifyEvent = {
      v: "1",
      type: "url_verification",
      challenge: "test_challenge_token_123",
    };

    const res = await fetch(`http://localhost:${APP_PORT}/hub/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(verifyEvent),
    });

    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toEqual({ challenge: "test_challenge_token_123" });
  });

  // --- 完整双向链路测试 ---

  it("完整双向链路：微信->钉钉->微信", async () => {
    // 步骤 1: 建立关联 + 微信用户发消息 -> Hub -> App -> 钉钉
    const dingtalkMsgId = `dt_frank_${Date.now()}`;
    store.saveMessageLink({
      installationId: MOCK_INSTALLATION_ID,
      dingtalkConversationId: defaultConversationId,
      dingtalkMsgId: dingtalkMsgId,
      wxUserId: "user_frank",
      wxUserName: "user_frank",
    });

    await injectMessage("user_frank", "你好，请帮我查个信息");

    await waitFor(async () => dingtalkSentMessages.length > 0, 5000);

    // 验证钉钉端收到消息
    expect(dingtalkSentMessages.length).toBe(1);
    expect(dingtalkSentMessages[0].text).toContain("user_frank");
    expect(dingtalkSentMessages[0].text).toContain("你好，请帮我查个信息");

    // 步骤 2: 钉钉用户回复 -> DingtalkToWx -> HubClient -> 微信
    const replyData: DingtalkMessageData = {
      conversationId: defaultConversationId,
      conversationType: "2",
      msgId: dingtalkMsgId,
      msgtype: "text",
      content: "查好了，结果如下...",
      senderStaffId: defaultStaffId,
      senderId: "dingtalk_helper",
      sessionWebhook: defaultWebhook,
      createAt: Date.now(),
    };

    const installations = store.getAllInstallations();
    await dingtalkToWx.handleDingtalkMessage(replyData, installations);

    // 验证 Mock Hub 收到了回复
    await waitFor(async () => {
      const msgs = await getMessages();
      return msgs.length > 0;
    }, 5000);

    const hubMessages = await getMessages();
    expect(hubMessages.length).toBe(1);
    expect(hubMessages[0].data.toId).toBe("user_frank");
    expect(hubMessages[0].data.content).toBe("查好了，结果如下...");
  });
});
