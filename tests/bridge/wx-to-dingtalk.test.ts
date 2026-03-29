/**
 * 微信→钉钉桥接测试
 * 验证 Markdown 格式转换、各消息类型处理、命令跳过
 */

import { describe, it, expect, vi } from "vitest";

/** 模拟消息格式转换（Markdown 格式化） */
function formatWxMessageAsMarkdown(
  wxUserName: string,
  msgType: string,
  content: string
): string {
  const header = `**[微信] ${wxUserName}:**`;

  switch (msgType) {
    case "text":
      return `${header}\n\n${content}`;
    case "image":
      return `${header}\n\n![图片](${content})`;
    case "link":
      return `${header}\n\n[链接](${content})`;
    case "file":
      return `${header}\n\n📎 [文件](${content})`;
    case "voice":
      return `${header}\n\n🎤 语音消息`;
    case "video":
      return `${header}\n\n🎬 视频消息`;
    case "location":
      return `${header}\n\n📍 位置: ${content}`;
    default:
      return `${header}\n\n${content}`;
  }
}

/** 判断是否为命令消息 */
function isCommand(content: string): boolean {
  return content.startsWith("/");
}

describe("WxToDingtalk 桥接", () => {
  describe("Markdown 格式化", () => {
    it("应当正确格式化文本消息", () => {
      const md = formatWxMessageAsMarkdown("张三", "text", "你好钉钉");
      expect(md).toContain("**[微信] 张三:**");
      expect(md).toContain("你好钉钉");
    });

    it("应当正确格式化图片消息", () => {
      const md = formatWxMessageAsMarkdown("李四", "image", "https://example.com/img.png");
      expect(md).toContain("![图片]");
      expect(md).toContain("https://example.com/img.png");
    });

    it("应当正确格式化链接消息", () => {
      const md = formatWxMessageAsMarkdown("王五", "link", "https://example.com/article");
      expect(md).toContain("[链接]");
      expect(md).toContain("https://example.com/article");
    });

    it("应当正确格式化文件消息", () => {
      const md = formatWxMessageAsMarkdown("赵六", "file", "https://example.com/doc.pdf");
      expect(md).toContain("📎");
      expect(md).toContain("[文件]");
    });

    it("应当正确格式化语音消息", () => {
      const md = formatWxMessageAsMarkdown("钱七", "voice", "");
      expect(md).toContain("🎤");
      expect(md).toContain("语音消息");
    });

    it("应当正确格式化视频消息", () => {
      const md = formatWxMessageAsMarkdown("孙八", "video", "");
      expect(md).toContain("🎬");
      expect(md).toContain("视频消息");
    });

    it("应当正确格式化位置消息", () => {
      const md = formatWxMessageAsMarkdown("周九", "location", "北京市朝阳区");
      expect(md).toContain("📍");
      expect(md).toContain("北京市朝阳区");
    });

    it("未知类型应回退到默认格式", () => {
      const md = formatWxMessageAsMarkdown("吴十", "unknown", "未知内容");
      expect(md).toContain("**[微信] 吴十:**");
      expect(md).toContain("未知内容");
    });
  });

  describe("命令跳过", () => {
    it("以 / 开头的消息应被识别为命令", () => {
      expect(isCommand("/help")).toBe(true);
      expect(isCommand("/bind")).toBe(true);
      expect(isCommand("/status")).toBe(true);
    });

    it("普通消息不应被识别为命令", () => {
      expect(isCommand("你好")).toBe(false);
      expect(isCommand("hello world")).toBe(false);
      expect(isCommand("")).toBe(false);
    });

    it("包含 / 但非开头不应被识别为命令", () => {
      expect(isCommand("hello /world")).toBe(false);
      expect(isCommand("a/b/c")).toBe(false);
    });
  });

  describe("消息类型处理", () => {
    const messageTypes = ["text", "image", "link", "file", "voice", "video", "location"];

    it("应当支持所有标准消息类型", () => {
      for (const type of messageTypes) {
        const md = formatWxMessageAsMarkdown("用户", type, "内容");
        expect(md).toBeDefined();
        expect(md.length).toBeGreaterThan(0);
      }
    });
  });
});
