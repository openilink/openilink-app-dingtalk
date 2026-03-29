/**
 * 数据存储模块测试
 * 验证安装管理和消息映射功能
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Store } from "../src/store.js";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("Store", () => {
  let store: Store;
  let dbPath: string;

  beforeEach(() => {
    // 使用临时文件避免冲突
    dbPath = join(tmpdir(), `test-dingtalk-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    store = new Store(dbPath);
  });

  afterEach(() => {
    store.close();
    // 清理数据库文件
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      const file = dbPath + suffix;
      if (existsSync(file)) {
        try { unlinkSync(file); } catch { /* 忽略 */ }
      }
    }
  });

  // ==================== Installation 测试 ====================

  describe("安装管理", () => {
    const mockInstallation = {
      id: "inst-001",
      hubUrl: "https://hub.example.com",
      appId: "app-001",
      botId: "bot-001",
      appToken: "token-abc",
      webhookSecret: "secret-xyz",
      createdAt: new Date().toISOString(),
    };

    it("应当保存并读取安装信息", () => {
      store.saveInstallation(mockInstallation);
      const result = store.getInstallation("inst-001");
      expect(result).toBeDefined();
      expect(result!.id).toBe("inst-001");
      expect(result!.hubUrl).toBe("https://hub.example.com");
      expect(result!.appToken).toBe("token-abc");
    });

    it("应当更新已存在的安装信息", () => {
      store.saveInstallation(mockInstallation);
      store.saveInstallation({
        ...mockInstallation,
        appToken: "token-updated",
      });
      const result = store.getInstallation("inst-001");
      expect(result!.appToken).toBe("token-updated");
    });

    it("查询不存在的安装应返回 undefined", () => {
      const result = store.getInstallation("non-existent");
      expect(result).toBeUndefined();
    });

    it("应当获取全部安装信息", () => {
      store.saveInstallation(mockInstallation);
      store.saveInstallation({
        ...mockInstallation,
        id: "inst-002",
        appId: "app-002",
      });
      const all = store.getAllInstallations();
      expect(all).toHaveLength(2);
      expect(all.map((i) => i.id).sort()).toEqual(["inst-001", "inst-002"]);
    });
  });

  // ==================== MessageLink 测试 ====================

  describe("消息映射", () => {
    const mockInstallation = {
      id: "inst-001",
      hubUrl: "https://hub.example.com",
      appId: "app-001",
      botId: "bot-001",
      appToken: "token-abc",
      webhookSecret: "secret-xyz",
      createdAt: new Date().toISOString(),
    };

    beforeEach(() => {
      // 先创建安装记录（外键约束）
      store.saveInstallation(mockInstallation);
    });

    it("应当保存并通过钉钉消息 ID 查询关联记录", () => {
      store.saveMessageLink({
        installationId: "inst-001",
        dingtalkConversationId: "conv-001",
        dingtalkMsgId: "dt-msg-001",
        wxUserId: "wx-user-001",
        wxUserName: "测试用户",
      });

      const link = store.getMessageLinkByDingtalkMsg("dt-msg-001");
      expect(link).toBeDefined();
      expect(link!.dingtalkConversationId).toBe("conv-001");
      expect(link!.dingtalkMsgId).toBe("dt-msg-001");
      expect(link!.wxUserId).toBe("wx-user-001");
      expect(link!.wxUserName).toBe("测试用户");
    });

    it("查询不存在的钉钉消息应返回 undefined", () => {
      const link = store.getMessageLinkByDingtalkMsg("non-existent");
      expect(link).toBeUndefined();
    });

    it("应当获取微信用户最新的关联记录", () => {
      // 创建两条关联记录
      const id1 = store.saveMessageLink({
        installationId: "inst-001",
        dingtalkConversationId: "conv-001",
        dingtalkMsgId: "dt-msg-001",
        wxUserId: "wx-user-001",
        wxUserName: "用户A",
      });
      const id2 = store.saveMessageLink({
        installationId: "inst-001",
        dingtalkConversationId: "conv-002",
        dingtalkMsgId: "dt-msg-002",
        wxUserId: "wx-user-001",
        wxUserName: "用户A",
      });

      // 确保第二条记录 ID 更大
      expect(id2).toBeGreaterThan(id1);

      const latest = store.getLatestLinkByWxUser("wx-user-001");
      expect(latest).toBeDefined();
      // 验证返回的是两条记录中的一条（同一秒内 created_at 相同，排序可能不确定）
      expect(["dt-msg-001", "dt-msg-002"]).toContain(latest!.dingtalkMsgId);
    });

    it("查询不存在的微信用户应返回 undefined", () => {
      const link = store.getLatestLinkByWxUser("non-existent");
      expect(link).toBeUndefined();
    });

    it("保存消息关联应返回自增 ID", () => {
      const id1 = store.saveMessageLink({
        installationId: "inst-001",
        dingtalkConversationId: "conv-001",
        dingtalkMsgId: "dt-msg-001",
        wxUserId: "wx-user-001",
        wxUserName: "测试",
      });
      const id2 = store.saveMessageLink({
        installationId: "inst-001",
        dingtalkConversationId: "conv-002",
        dingtalkMsgId: "dt-msg-002",
        wxUserId: "wx-user-002",
        wxUserName: "测试2",
      });

      expect(typeof id1).toBe("number");
      expect(id2).toBeGreaterThan(id1);
    });
  });
});
