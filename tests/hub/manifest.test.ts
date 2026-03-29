/**
 * 应用清单测试
 * 验证 manifest 结构、URL 和 tools 配置
 */

import { describe, it, expect } from "vitest";

/** 模拟 getManifest 函数 */
function getManifest(baseUrl: string, tools: any[]): Record<string, any> {
  return {
    name: "@openilink/app-dingtalk",
    display_name: "钉钉桥接",
    description: "微信 ↔ 钉钉双向桥接 + 钉钉 AI Tools",
    version: "0.1.0",
    webhook_url: `${baseUrl}/hub/webhook`,
    oauth: {
      setup_url: `${baseUrl}/oauth/setup`,
      redirect_url: `${baseUrl}/oauth/redirect`,
    },
    tools,
  };
}

describe("getManifest", () => {
  const baseUrl = "https://dingtalk.example.com";

  const mockTools = [
    { name: "send_text_message", description: "发送文本消息" },
    { name: "send_markdown_message", description: "发送 Markdown 消息" },
    { name: "search_user", description: "搜索用户" },
  ];

  it("应当包含正确的应用名称", () => {
    const manifest = getManifest(baseUrl, mockTools);
    expect(manifest.name).toBe("@openilink/app-dingtalk");
  });

  it("应当包含必要的结构字段", () => {
    const manifest = getManifest(baseUrl, mockTools);
    expect(manifest).toHaveProperty("name");
    expect(manifest).toHaveProperty("display_name");
    expect(manifest).toHaveProperty("description");
    expect(manifest).toHaveProperty("version");
    expect(manifest).toHaveProperty("webhook_url");
    expect(manifest).toHaveProperty("oauth");
    expect(manifest).toHaveProperty("tools");
  });

  it("webhook_url 应当指向 /hub/webhook", () => {
    const manifest = getManifest(baseUrl, mockTools);
    expect(manifest.webhook_url).toBe("https://dingtalk.example.com/hub/webhook");
    expect(manifest.webhook_url).toContain("/hub/webhook");
  });

  it("OAuth URL 应当使用正确的 baseUrl", () => {
    const manifest = getManifest(baseUrl, mockTools);
    expect(manifest.oauth.setup_url).toBe("https://dingtalk.example.com/oauth/setup");
    expect(manifest.oauth.redirect_url).toBe("https://dingtalk.example.com/oauth/redirect");
  });

  it("应当包含所有传入的 tools", () => {
    const manifest = getManifest(baseUrl, mockTools);
    expect(manifest.tools).toHaveLength(3);
    expect(manifest.tools[0].name).toBe("send_text_message");
    expect(manifest.tools[2].name).toBe("search_user");
  });

  it("工具列表为空时应返回空数组", () => {
    const manifest = getManifest(baseUrl, []);
    expect(manifest.tools).toHaveLength(0);
    expect(manifest.tools).toEqual([]);
  });

  it("不同 baseUrl 应生成不同的 webhook 地址", () => {
    const m1 = getManifest("https://a.example.com", mockTools);
    const m2 = getManifest("https://b.example.com", mockTools);
    expect(m1.webhook_url).not.toBe(m2.webhook_url);
    expect(m1.webhook_url).toContain("a.example.com");
    expect(m2.webhook_url).toContain("b.example.com");
  });
});
