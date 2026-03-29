/**
 * 配置模块测试
 * 验证默认值和必填环境变量校验
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  // 保存原始环境变量
  const originalEnv = { ...process.env };

  /** 设置最小必填环境变量 */
  function setRequiredEnv(): void {
    process.env.HUB_URL = "https://hub.example.com";
    process.env.BASE_URL = "https://app.example.com";
    process.env.DINGTALK_CLIENT_ID = "test-client-id";
    process.env.DINGTALK_CLIENT_SECRET = "test-client-secret";
  }

  beforeEach(() => {
    // 清除相关环境变量
    delete process.env.PORT;
    delete process.env.HUB_URL;
    delete process.env.BASE_URL;
    delete process.env.DB_PATH;
    delete process.env.DINGTALK_CLIENT_ID;
    delete process.env.DINGTALK_CLIENT_SECRET;
    delete process.env.DINGTALK_ROBOT_CODE;
  });

  afterEach(() => {
    // 恢复原始环境变量
    process.env = { ...originalEnv };
  });

  it("应当使用默认端口 8084", () => {
    setRequiredEnv();
    const config = loadConfig();
    expect(config.port).toBe("8084");
  });

  it("应当允许通过 PORT 环境变量覆盖端口", () => {
    setRequiredEnv();
    process.env.PORT = "3000";
    const config = loadConfig();
    expect(config.port).toBe("3000");
  });

  it("应当使用默认数据库路径 data/dingtalk.db", () => {
    setRequiredEnv();
    const config = loadConfig();
    expect(config.dbPath).toBe("data/dingtalk.db");
  });

  it("应当允许通过 DB_PATH 覆盖数据库路径", () => {
    setRequiredEnv();
    process.env.DB_PATH = "/tmp/test.db";
    const config = loadConfig();
    expect(config.dbPath).toBe("/tmp/test.db");
  });

  it("应当正确读取所有必填字段", () => {
    setRequiredEnv();
    const config = loadConfig();
    expect(config.hubUrl).toBe("https://hub.example.com");
    expect(config.baseUrl).toBe("https://app.example.com");
    expect(config.dingtalkClientId).toBe("test-client-id");
    expect(config.dingtalkClientSecret).toBe("test-client-secret");
  });

  it("dingtalkRobotCode 缺失时默认为空字符串", () => {
    setRequiredEnv();
    const config = loadConfig();
    expect(config.dingtalkRobotCode).toBe("");
  });

  it("缺少 HUB_URL 时应抛出错误", () => {
    setRequiredEnv();
    delete process.env.HUB_URL;
    expect(() => loadConfig()).toThrow("HUB_URL");
  });

  it("缺少 BASE_URL 时应抛出错误", () => {
    setRequiredEnv();
    delete process.env.BASE_URL;
    expect(() => loadConfig()).toThrow("BASE_URL");
  });

  it("缺少 DINGTALK_CLIENT_ID 时应抛出错误", () => {
    setRequiredEnv();
    delete process.env.DINGTALK_CLIENT_ID;
    expect(() => loadConfig()).toThrow("DINGTALK_CLIENT_ID");
  });

  it("缺少 DINGTALK_CLIENT_SECRET 时应抛出错误", () => {
    setRequiredEnv();
    delete process.env.DINGTALK_CLIENT_SECRET;
    expect(() => loadConfig()).toThrow("DINGTALK_CLIENT_SECRET");
  });
});
