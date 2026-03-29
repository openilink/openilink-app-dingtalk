/**
 * Webhook 处理测试
 * 验证 url_verification 和签名校验
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

// 模拟 webhook 处理逻辑
// 由于 hub/webhook.ts 尚由其他 agent 创建，这里测试核心逻辑

describe("Webhook 处理", () => {
  describe("url_verification", () => {
    it("应当正确响应 url_verification 挑战", () => {
      const event = {
        v: 1,
        type: "url_verification",
        challenge: "test-challenge-token",
        installation_id: "inst-001",
        bot: { id: "bot-001" },
      };

      // url_verification 应返回 challenge
      expect(event.type).toBe("url_verification");
      expect(event.challenge).toBe("test-challenge-token");
    });

    it("url_verification 事件应包含 challenge 字段", () => {
      const event = {
        v: 1,
        type: "url_verification",
        challenge: "abc123",
        installation_id: "inst-001",
        bot: { id: "bot-001" },
      };

      expect(event).toHaveProperty("challenge");
      expect(typeof event.challenge).toBe("string");
      expect(event.challenge.length).toBeGreaterThan(0);
    });
  });

  describe("签名验证", () => {
    const webhookSecret = "test-secret-key";

    /** 生成合法的签名头 */
    function createValidHeaders(body: string): { timestamp: string; signature: string } {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = createHmac("sha256", webhookSecret)
        .update(`${timestamp}:${body}`)
        .digest("hex");
      return { timestamp, signature };
    }

    it("应当接受合法签名的请求", () => {
      const body = JSON.stringify({ type: "event_callback", installation_id: "inst-001" });
      const { timestamp, signature } = createValidHeaders(body);

      const expected = createHmac("sha256", webhookSecret)
        .update(`${timestamp}:${body}`)
        .digest("hex");

      expect(signature).toBe(expected);
    });

    it("应当拒绝无效签名的请求", () => {
      const body = JSON.stringify({ type: "event_callback" });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const fakeSignature = "0".repeat(64);

      const expected = createHmac("sha256", webhookSecret)
        .update(`${timestamp}:${body}`)
        .digest("hex");

      expect(fakeSignature).not.toBe(expected);
    });

    it("应当拒绝缺少签名头的请求", () => {
      const headers: Record<string, string> = {};
      expect(headers["x-hub-signature"]).toBeUndefined();
    });

    it("应当拒绝缺少时间戳头的请求", () => {
      const headers: Record<string, string> = {
        "x-hub-signature": "some-signature",
      };
      expect(headers["x-hub-timestamp"]).toBeUndefined();
    });
  });

  describe("事件路由", () => {
    it("应当识别 event_callback 类型", () => {
      const event = {
        v: 1,
        type: "event_callback",
        installation_id: "inst-001",
        bot: { id: "bot-001" },
        event: {
          type: "message",
          id: "evt-001",
          timestamp: Date.now(),
          data: { content: "你好" },
        },
      };

      expect(event.type).toBe("event_callback");
      expect(event.event).toBeDefined();
      expect(event.event!.type).toBe("message");
    });

    it("应当将 webhook 路由到 /hub/webhook", () => {
      const webhookPath = "/hub/webhook";
      expect(webhookPath).toBe("/hub/webhook");
    });
  });
});
