/**
 * 路由器测试
 * 验证命令注册、解析和路由分发
 */

import { describe, it, expect, vi } from "vitest";
import { Router } from "../src/router.js";

describe("Router", () => {
  describe("命令注册", () => {
    it("应当注册命令处理器", () => {
      const router = new Router();
      const handler = vi.fn();
      router.register("help", handler);

      expect(router.getRegisteredCommands()).toContain("help");
    });

    it("应当支持注册多个命令", () => {
      const router = new Router();
      router.register("help", vi.fn());
      router.register("bind", vi.fn());
      router.register("status", vi.fn());

      const commands = router.getRegisteredCommands();
      expect(commands).toContain("help");
      expect(commands).toContain("bind");
      expect(commands).toContain("status");
      expect(commands).toHaveLength(3);
    });
  });

  describe("命令路由", () => {
    it("应当从 event.event.data.command 提取命令", async () => {
      const router = new Router();
      const handler = vi.fn();
      router.register("help", handler);

      const event = {
        event: { data: { command: "/help" } },
      };

      const matched = await router.handleCommand(event);
      expect(matched).toBe(true);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it("应当从 event.event.data.name 提取命令（回退）", async () => {
      const router = new Router();
      const handler = vi.fn();
      router.register("status", handler);

      const event = {
        event: { data: { name: "/status" } },
      };

      const matched = await router.handleCommand(event);
      expect(matched).toBe(true);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it("command 优先于 name 使用", async () => {
      const router = new Router();
      const helpHandler = vi.fn();
      const statusHandler = vi.fn();
      router.register("help", helpHandler);
      router.register("status", statusHandler);

      const event = {
        event: { data: { command: "/help", name: "/status" } },
      };

      await router.handleCommand(event);
      expect(helpHandler).toHaveBeenCalled();
      expect(statusHandler).not.toHaveBeenCalled();
    });

    it("应当去掉 / 前缀", async () => {
      const router = new Router();
      const handler = vi.fn();
      router.register("bind", handler);

      const event = {
        event: { data: { command: "/bind" } },
      };

      const matched = await router.handleCommand(event);
      expect(matched).toBe(true);
    });

    it("没有 / 前缀的命令也应正常匹配", async () => {
      const router = new Router();
      const handler = vi.fn();
      router.register("help", handler);

      const event = {
        event: { data: { command: "help" } },
      };

      const matched = await router.handleCommand(event);
      expect(matched).toBe(true);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe("未匹配命令", () => {
    it("未注册的命令应返回 false", async () => {
      const router = new Router();
      const event = {
        event: { data: { command: "/unknown" } },
      };

      const matched = await router.handleCommand(event);
      expect(matched).toBe(false);
    });

    it("缺少 event.event.data 应返回 false", async () => {
      const router = new Router();
      router.register("help", vi.fn());

      expect(await router.handleCommand({})).toBe(false);
      expect(await router.handleCommand({ event: {} })).toBe(false);
      expect(await router.handleCommand({ event: { data: {} } })).toBe(false);
      expect(await router.handleCommand(null)).toBe(false);
      expect(await router.handleCommand(undefined)).toBe(false);
    });
  });

  describe("异步处理器", () => {
    it("应当等待异步处理器完成", async () => {
      const router = new Router();
      let executed = false;

      router.register("async-cmd", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        executed = true;
      });

      const event = {
        event: { data: { command: "/async-cmd" } },
      };

      await router.handleCommand(event);
      expect(executed).toBe(true);
    });
  });
});
