/**
 * OpeniLink Hub App — 钉钉 Bridge
 * 微信 <-> 钉钉双向消息桥接的 HTTP 服务入口
 */

import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { loadConfig } from "./config.js";
import { Store } from "./store.js";
import { handleOAuthSetup, handleOAuthRedirect, handleOAuthNotify, cleanExpired } from "./hub/oauth.js";
import { handleSettingsPage, handleSettingsVerify, handleSettingsSave } from "./hub/settings.js";
import { handleWebhook, readBody } from "./hub/webhook.js";
import { createManifest } from "./hub/manifest.js";
import type { HubEvent, ToolResult } from "./hub/types.js";
import { HubClient } from "./hub/client.js";
import { DingtalkClient } from "./dingtalk/client.js";
import { collectAllTools } from "./tools/index.js";

/** 按 installation_id 缓存的 per-installation 钉钉客户端 */
const dingtalkClientCache = new Map<string, DingtalkClient>();

/** 获取或创建 per-installation 的钉钉客户端 */
function getOrCreateDingtalkClient(
  installationId: string,
  clientId: string,
  clientSecret: string,
  robotCode: string,
  defaultClient: DingtalkClient | null,
): DingtalkClient {
  // 如果没有 installationId 且有默认客户端，直接复用
  if (!installationId && defaultClient) return defaultClient;
  const cached = dingtalkClientCache.get(installationId);
  if (cached) return cached;
  // 如果有凭证则创建新客户端并缓存
  if (clientId && clientSecret) {
    const client = new DingtalkClient(clientId, clientSecret, robotCode);
    dingtalkClientCache.set(installationId, client);
    console.log(`[Server] 为安装 ${installationId} 创建了独立的钉钉客户端`);
    return client;
  }
  // 兜底：使用默认客户端
  if (defaultClient) return defaultClient;
  throw new Error(`[Server] 安装 ${installationId} 缺少钉钉凭证且无默认客户端`);
}

// 加载配置
const config = loadConfig();
const store = new Store(config.dbPath);
const manifest = createManifest(config);

// 初始化钉钉客户端（如果环境变量中配置了钉钉凭证）
const hasDingtalkCredentials = !!(config.dingtalkClientId && config.dingtalkClientSecret);
const dingtalkClient = hasDingtalkCredentials
  ? new DingtalkClient(
      config.dingtalkClientId,
      config.dingtalkClientSecret,
      config.dingtalkRobotCode,
    )
  : null;
if (dingtalkClient) {
  console.log("[Server] 钉钉客户端初始化完成");
} else {
  console.log("[Server] 未配置钉钉凭证，跳过默认钉钉客户端初始化（云端托管模式，用户安装时填写）");
}

// 收集所有工具定义和处理器（需要一个客户端实例来获取定义，如果没有默认客户端则用空凭证的客户端仅收集定义）
const toolsSdkClient = dingtalkClient ?? new DingtalkClient("", "", "");
const { definitions: toolDefinitions, handlers: toolHandlers } =
  collectAllTools(toolsSdkClient);
console.log(`[Server] 已注册 ${toolDefinitions.length} 个 AI Tools`);

// 将工具定义转换为 Hub 同步格式
const toolsForHub = toolDefinitions.map((t) => ({
  name: t.name,
  description: t.description,
  command: t.command,
  parameters: t.parameters,
}));

/**
 * 向指定安装同步工具定义
 */
async function syncToolsToInstallation(hubUrl: string, appToken: string): Promise<void> {
  const client = new HubClient(hubUrl, appToken);
  await client.syncTools(toolsForHub);
}

/**
 * 启动时遍历所有已有安装，同步工具定义
 */
async function syncToolsOnStartup(): Promise<void> {
  const installations = store.getAllInstallations();
  if (installations.length === 0) {
    console.log("[Server] 暂无安装记录，跳过启动时工具同步");
    return;
  }

  console.log(`[Server] 启动时同步工具到 ${installations.length} 个安装...`);
  for (const inst of installations) {
    try {
      await syncToolsToInstallation(inst.hubUrl, inst.appToken);
    } catch (err) {
      console.error(`[Server] 同步工具到安装 ${inst.id} 失败:`, err);
    }
  }
}

/**
 * 处理 command 事件（同步/异步响应模式）
 * 在 SYNC_DEADLINE 内完成则同步返回结果，超时则由调用方异步推送
 */
async function onCommand(event: HubEvent, installationId: string): Promise<string | ToolResult> {
  const installation = store.getInstallation(installationId);
  if (!installation) {
    return `未找到安装: ${installationId}`;
  }

  // 读取本地加密存储的用户配置，优先于环境变量
  const userCfg = store.getConfig(installationId);
  const clientId = userCfg.dingtalk_client_id || config.dingtalkClientId;
  const clientSecret = userCfg.dingtalk_client_secret || config.dingtalkClientSecret;
  const robotCode = userCfg.dingtalk_robot_code || config.dingtalkRobotCode;

  // 如果用户有自定义凭证，使用 per-installation 缓存客户端
  const instDingtalkClient = getOrCreateDingtalkClient(
    installationId, clientId, clientSecret, robotCode, dingtalkClient,
  );

  // 用当前安装对应的钉钉客户端重新收集 tools handlers
  const { handlers: instHandlers } = collectAllTools(instDingtalkClient);

  const data = event.event?.data;
  if (!data) return "缺少事件数据";

  const command = data.command as string;
  const args = (data.args as Record<string, any>) ?? {};
  const userId = data.user_id as string;

  const handler = instHandlers.get(command);
  if (!handler) {
    return `未知指令: ${command}`;
  }

  try {
    const result = await handler({
      installationId,
      botId: event.bot.id,
      userId,
      traceId: event.trace_id,
      args,
    });

    return result;
  } catch (err) {
    console.error(`[Event] 工具调用失败: ${command}`, err);
    // 异步推送错误信息
    const hubClient = new HubClient(installation.hubUrl, installation.appToken);
    const to =
      (data.group as { id?: string })?.id ??
      (data.sender as { id?: string })?.id ??
      userId ??
      (data.from as string) ??
      "";
    await hubClient.sendText(to, `工具 ${command} 执行失败`, event.trace_id).catch(() => {});
    return `工具 ${command} 执行失败`;
  }
}

/**
 * 处理非 command 类型的 Hub 事件
 */
async function onHubEvent(event: HubEvent): Promise<void> {
  console.log(
    `[Event] type=${event.event?.type} id=${event.event?.id} trace=${event.trace_id}`,
  );

  const installation = store.getInstallation(event.installation_id);
  if (!installation) {
    console.warn(`[Event] 未找到安装: ${event.installation_id}`);
    return;
  }

  // 创建 Hub 客户端用于回复
  const _client = new HubClient(installation.hubUrl, installation.appToken);

  // TODO: 根据事件类型分发处理
  console.log(`[Event] 事件数据:`, JSON.stringify(event.event?.data));
}

// 定期清理过期的 PKCE 缓存
const cleanupTimer = setInterval(cleanExpired, 60_000);

/**
 * HTTP 请求路由
 */
async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
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

    // GET/POST /oauth/setup - OAuth 安装流程（显示配置表单 / 提交后跳转授权）
    if (pathname === "/oauth/setup" && (req.method === "GET" || req.method === "POST")) {
      await handleOAuthSetup(req, res, config);
      return;
    }

    if (pathname === "/oauth/redirect") {
      if (req.method === "GET") {
        // 模式 1: OAuth PKCE 回调
        await handleOAuthRedirect(req, res, config, store, toolsForHub);
      } else if (req.method === "POST") {
        // 模式 2: Hub 直接安装通知
        await handleOAuthNotify(req, res, config, store, toolsForHub);
      } else {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Method Not Allowed" }));
      }
      return;
    }

    // GET /settings — 设置页面（输入 token 验证身份）
    if (req.method === "GET" && pathname === "/settings") {
      handleSettingsPage(req, res);
      return;
    }

    // POST /settings/verify — 验证 token 后显示配置表单
    if (req.method === "POST" && pathname === "/settings/verify") {
      await handleSettingsVerify(req, res, config, store);
      return;
    }

    // POST /settings/save — 保存修改后的配置
    if (req.method === "POST" && pathname === "/settings/save") {
      await handleSettingsSave(req, res, config, store);
      return;
    }

    // Hub Webhook（传入 onEvent 和 command 处理器）
    if (pathname === "/hub/webhook") {
      await handleWebhook(req, res, store, onHubEvent, onCommand);
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

  // 启动后同步工具到所有已有安装
  syncToolsOnStartup().catch((err) => {
    console.error("[Server] 启动时同步工具异常:", err);
  });
});

// 优雅退出
process.on("SIGINT", () => {
  console.log("\n[Server] 正在关闭...");
  clearInterval(cleanupTimer);
  store.close();
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  console.log("[Server] 收到 SIGTERM，正在关闭...");
  clearInterval(cleanupTimer);
  store.close();
  server.close(() => process.exit(0));
});
