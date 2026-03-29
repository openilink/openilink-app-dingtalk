/**
 * OpeniLink Hub App — 钉钉 Bridge
 * 微信 ↔ 钉钉双向消息桥接的 HTTP 服务入口
 */

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { loadConfig } from "./config.js";
import { Store } from "./store.js";
import { handleOAuthSetup, handleOAuthRedirect } from "./hub/oauth.js";
import { handleWebhook } from "./hub/webhook.js";
import { createManifest } from "./hub/manifest.js";
import type { HubEvent } from "./hub/types.js";
import { HubClient } from "./hub/client.js";

// 加载配置
const config = loadConfig();
const store = new Store(config.dbPath);
const manifest = createManifest(config);

/**
 * 处理 Hub 推送的事件
 * 后续在此扩展钉钉消息转发逻辑
 */
async function onHubEvent(event: HubEvent): Promise<void> {
  console.log(
    `[Event] type=${event.event?.type} id=${event.event?.id} trace=${event.trace_id}`
  );

  const installation = store.getInstallation(event.installation_id);
  if (!installation) {
    console.warn(`[Event] 未找到安装: ${event.installation_id}`);
    return;
  }

  // 创建 Hub 客户端用于回复微信
  const _client = new HubClient(installation.hubUrl, installation.appToken);

  // TODO: 根据事件类型分发处理
  // - message: 转发微信消息到钉钉
  // - command: 处理命令
  console.log(`[Event] 事件数据:`, JSON.stringify(event.event?.data));
}

/**
 * HTTP 请求路由
 */
async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const url = new URL(req.url ?? "/", config.baseUrl);
  const pathname = url.pathname;

  try {
    // Manifest 端点
    if (pathname === "/manifest.json" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(manifest, null, 2));
      return;
    }

    // 健康检查
    if (pathname === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, timestamp: Date.now() }));
      return;
    }

    // OAuth 安装流程
    if (pathname === "/oauth/setup" && req.method === "GET") {
      handleOAuthSetup(req, res, config);
      return;
    }

    if (pathname === "/oauth/redirect" && req.method === "GET") {
      await handleOAuthRedirect(req, res, config, store);
      return;
    }

    // Hub Webhook
    if (pathname === "/hub/webhook") {
      await handleWebhook(req, res, store, onHubEvent);
      return;
    }

    // 404
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "未找到" }));
  } catch (err) {
    console.error("[Server] 请求处理异常:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "内部服务器错误" }));
    }
  }
}

// 启动 HTTP 服务
const server = createServer(handleRequest);

server.listen(Number(config.port), () => {
  console.log(`[Server] 钉钉 Bridge 已启动，端口: ${config.port}`);
  console.log(`[Server] Manifest: ${config.baseUrl}/manifest.json`);
  console.log(`[Server] Webhook:  ${config.baseUrl}/hub/webhook`);
});

// 优雅退出
process.on("SIGINT", () => {
  console.log("\n[Server] 正在关闭...");
  store.close();
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  console.log("[Server] 收到 SIGTERM，正在关闭...");
  store.close();
  server.close(() => process.exit(0));
});
