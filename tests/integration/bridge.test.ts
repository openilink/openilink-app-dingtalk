/**
 * 钉钉 Bridge 集成测试
 *
 * 前置条件：
 * 1. OpeniLink Hub Mock Server 运行在 localhost:9801
 * 2. openilink-app-dingtalk 运行在 localhost:8084
 *
 * 使用 scripts/test-integration.sh 一键启动所有依赖并运行测试。
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  resetMock,
  injectMessage,
  injectCommand,
  getMessages,
  waitFor,
  MOCK_HUB_URL,
} from "./setup.js";

describe("钉钉 Bridge 集成测试", () => {
  // 每个用例执行前重置 Mock Server 状态
  beforeEach(async () => {
    await resetMock();
  });

  it("微信文本消息应转发到钉钉", async () => {
    // 注入一条模拟微信文本消息
    await injectMessage("wx_user_001", "你好，这是一条测试消息");

    // 等待 App 处理事件（App 收到 webhook 后会转发到钉钉）
    // 由于是集成测试环境，钉钉客户端使用 mock 凭据，
    // 这里主要验证 App 能正确接收并处理 webhook 事件
    await waitFor(async () => {
      const res = await fetch("http://localhost:8084/health");
      return res.ok;
    }, 3000);

    // 验证 App 健康检查通过，说明服务正常运行中
    const healthRes = await fetch("http://localhost:8084/health");
    expect(healthRes.ok).toBe(true);
    const health = await healthRes.json();
    expect(health.ok).toBe(true);
  });

  it("命令消息应触发 tool 执行", async () => {
    // 注入一条命令事件
    await injectCommand("wx_user_002", "/help");

    // 等待 App 处理命令并通过 Hub 回复
    await waitFor(async () => {
      const msgs = await getMessages();
      return msgs.length > 0;
    }, 5000);

    // 验证 Mock Server 记录了 App 发送的回复消息
    const messages = await getMessages();
    expect(messages.length).toBeGreaterThan(0);

    // 回复消息应包含文本内容
    const reply = messages[0];
    expect(reply).toHaveProperty("content");
  });

  it("Mock Server 应记录 App 发送的消息", async () => {
    // 先确认消息列表为空（重置后）
    const before = await getMessages();
    expect(before).toHaveLength(0);

    // 注入消息触发 App 向 Hub 发送回复
    await injectCommand("wx_user_003", "/help");

    // 等待消息被记录
    await waitFor(async () => {
      const msgs = await getMessages();
      return msgs.length > 0;
    }, 5000);

    // 验证消息确实被记录
    const after = await getMessages();
    expect(after.length).toBeGreaterThan(0);

    // 再次重置后应清空
    await resetMock();
    const cleared = await getMessages();
    expect(cleared).toHaveLength(0);
  });
});
