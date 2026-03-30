/**
 * OAuth2 + PKCE 安装流程
 *
 * 1. Hub 访问 /oauth/setup → 显示配置表单 HTML，用户填写钉钉 Key
 * 2. 用户提交表单后生成 PKCE，重定向到 Hub 授权页
 * 3. Hub 授权完成后回调 /oauth/redirect → 用 code + code_verifier 换取安装信息
 * 4. 成功后将用户填写的钉钉 Key 加密存储，同步 tools + 重定向到 returnUrl
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { generatePKCE } from "../utils/crypto.js";
import type { Config } from "../config.js";
import type { Store } from "../store.js";
import type { Installation } from "./types.js";
import { HubClient } from "./client.js";
import { readBody } from "./webhook.js";

/** PKCE 缓存条目（含用户填写的钉钉 Key 配置） */
interface PKCEEntry {
  verifier: string;
  hub: string;
  appId: string;
  returnUrl: string;
  /** 用户在 setup 页面填写的钉钉凭证 */
  userConfig?: Record<string, string>;
  expiresAt: number;
}

/** PKCE 缓存，key 为 localState，10 分钟过期 */
const pkceCache = new Map<string, PKCEEntry>();

/** 缓存过期时间：10 分钟 */
const PKCE_TTL_MS = 10 * 60 * 1000;

/** 清理过期的 PKCE 条目 */
export function cleanExpired(): void {
  const now = Date.now();
  for (const [key, entry] of pkceCache) {
    if (entry.expiresAt < now) {
      pkceCache.delete(key);
    }
  }
}

/**
 * 处理 OAuth 安装流程第一步：
 * GET  → 显示配置表单 HTML，让用户填写钉钉 Key
 * POST → 读取表单数据，生成 PKCE 并重定向到 Hub 授权页
 * 路由: GET/POST /oauth/setup
 */
export async function handleOAuthSetup(
  req: IncomingMessage,
  res: ServerResponse,
  config: Config,
): Promise<void> {
  const url = new URL(req.url ?? "/", config.baseUrl);
  const params = url.searchParams;

  const hub = params.get("hub") ?? config.hubUrl;
  const appId = params.get("app_id") ?? "";
  const botId = params.get("bot_id") ?? "";
  const hubState = params.get("state") ?? "";
  const returnUrl = params.get("return_url") ?? "";

  // POST 请求 — 用户提交了配置表单
  if (req.method === "POST") {
    const body = await readBody(req);
    const formData = new URLSearchParams(body);
    const dingtalkClientId = formData.get("dingtalk_client_id") || "";
    const dingtalkClientSecret = formData.get("dingtalk_client_secret") || "";
    const dingtalkRobotCode = formData.get("dingtalk_robot_code") || "";

    if (!hub || !appId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "缺少必填参数: hub, app_id" }));
      return;
    }

    // 清理过期缓存
    cleanExpired();

    // 生成 PKCE
    const { codeVerifier, codeChallenge } = generatePKCE();
    const localState = crypto.randomUUID();

    // 缓存 PKCE + 用户填的 Key
    pkceCache.set(localState, {
      verifier: codeVerifier,
      hub,
      appId,
      returnUrl,
      userConfig: {
        dingtalk_client_id: dingtalkClientId,
        dingtalk_client_secret: dingtalkClientSecret,
        dingtalk_robot_code: dingtalkRobotCode,
      },
      expiresAt: Date.now() + PKCE_TTL_MS,
    });

    // 构建 Hub 授权 URL
    const authorizeUrl = new URL(`/api/apps/${appId}/oauth/authorize`, hub);
    if (botId) authorizeUrl.searchParams.set("bot_id", botId);
    authorizeUrl.searchParams.set("state", localState);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    if (hubState) authorizeUrl.searchParams.set("hub_state", hubState);

    // 重定向到 Hub 授权页
    res.writeHead(302, { Location: authorizeUrl.toString() });
    res.end();
    return;
  }

  // GET 请求 — 显示配置表单 HTML
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>钉钉 Bridge — 配置</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: white; border-radius: 12px; padding: 32px; max-width: 420px; width: 100%; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .desc { color: #666; font-size: 14px; margin-bottom: 24px; }
    label { display: block; font-size: 14px; font-weight: 500; margin-bottom: 6px; color: #333; }
    input { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; margin-bottom: 16px; }
    input:focus { outline: none; border-color: #0089FF; }
    .required::after { content: " *"; color: red; }
    button { width: 100%; padding: 12px; background: #0089FF; color: white; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; }
    button:hover { background: #0070d6; }
    .hint { font-size: 12px; color: #999; margin-top: -12px; margin-bottom: 16px; }
    a { color: #0089FF; }
  </style>
</head>
<body>
  <div class="card">
    <h1>钉钉 Bridge</h1>
    <p class="desc">请填写您的钉钉应用凭证，用于连接钉钉 API</p>
    <form method="POST" action="/oauth/setup?hub=${encodeURIComponent(hub)}&app_id=${encodeURIComponent(appId)}&bot_id=${encodeURIComponent(botId)}&state=${encodeURIComponent(hubState)}&return_url=${encodeURIComponent(returnUrl)}">
      <label class="required">钉钉 AppKey</label>
      <input name="dingtalk_client_id" placeholder="企业内部应用的 AppKey" required />
      <p class="hint">在 <a href="https://open-dev.dingtalk.com" target="_blank">钉钉开发者后台</a> → 基础信息中获取</p>

      <label class="required">钉钉 AppSecret</label>
      <input name="dingtalk_client_secret" type="password" placeholder="企业内部应用的 AppSecret" required />

      <label>机器人 Code（可选）</label>
      <input name="dingtalk_robot_code" placeholder="机器人的 RobotCode" />
      <p class="hint">在应用能力 → 机器人配置中查看</p>

      <button type="submit">确认并安装</button>
    </form>
  </div>
</body>
</html>`;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

/**
 * 处理 Hub 模式 2 直接安装通知（POST /oauth/redirect）
 * Hub 直接创建安装后 POST 凭证过来，App 保存凭证并返回 webhook_url
 */
export async function handleOAuthNotify(
  req: IncomingMessage,
  res: ServerResponse,
  config: Config,
  store: Store,
  tools?: Record<string, unknown>[],
): Promise<void> {
  try {
    const body = await readBody(req);
    const payload = JSON.parse(body) as {
      installation_id?: string;
      app_token?: string;
      webhook_secret?: string;
      bot_id?: string;
      handle?: string;
      hub_url?: string;
    };

    const { installation_id, app_token, webhook_secret, bot_id, hub_url } = payload;

    // 校验必填字段
    if (!installation_id || !app_token || !webhook_secret) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "缺少必填字段: installation_id, app_token, webhook_secret" }));
      return;
    }

    // 保存安装信息
    store.saveInstallation({
      id: installation_id,
      hubUrl: hub_url || config.hubUrl,
      appId: "",
      botId: bot_id || "",
      appToken: app_token,
      webhookSecret: webhook_secret,
    });

    // 异步同步 tools 到 Hub
    const hubClient = new HubClient(hub_url || config.hubUrl, app_token);
    if (tools && tools.length > 0) {
      hubClient.syncTools(tools).catch((err) => {
        console.error("[notify] 工具定义同步失败:", err);
      });
    }

    // 异步拉取用户配置并加密存储到本地
    hubClient.fetchConfig().then((cfg) => {
      if (Object.keys(cfg).length > 0) {
        store.saveConfig(installation_id, cfg);
        console.log("[notify] 用户配置已拉取并加密存储");
      }
    }).catch((e) => console.error("[notify] 拉取用户配置失败:", e));

    console.log(`[notify] 模式 2 安装成功: installation_id=${installation_id}`);

    // 返回 webhook_url
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ webhook_url: `${config.baseUrl}/hub/webhook` }));
  } catch (err) {
    console.error("[notify] 处理安装通知异常:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "处理安装通知失败" }));
    }
  }
}

/**
 * 处理 OAuth 回调：用授权码 + code_verifier 换取凭证并保存
 * 同时将用户在 setup 页面填写的钉钉 Key 加密存储到本地
 * 路由: GET /oauth/redirect
 */
export async function handleOAuthRedirect(
  req: IncomingMessage,
  res: ServerResponse,
  config: Config,
  store: Store,
  tools?: Record<string, unknown>[],
): Promise<void> {
  const url = new URL(req.url ?? "/", config.baseUrl);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "缺少 code 或 state 参数" }));
    return;
  }

  // 清理过期缓存
  cleanExpired();

  // 查找并消费 state 对应的缓存信息
  const pkceEntry = pkceCache.get(state);
  if (!pkceEntry) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "无效或已过期的 state" }));
    return;
  }
  pkceCache.delete(state);

  const { verifier, hub, appId, returnUrl, userConfig } = pkceEntry;

  try {
    // 用 code + code_verifier 换取安装信息
    const exchangeUrl = `${hub.replace(/\/+$/, "")}/api/apps/${appId}/oauth/exchange`;
    const tokenRes = await fetch(exchangeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[OAuth] 换取 token 失败:", tokenRes.status, errText);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "换取 token 失败", detail: errText }));
      return;
    }

    const tokenData = (await tokenRes.json()) as {
      installation_id: string;
      app_id: string;
      bot_id: string;
      app_token: string;
      webhook_secret: string;
    };

    // 持久化安装信息
    const installation: Installation = {
      id: tokenData.installation_id,
      hubUrl: hub,
      appId: tokenData.app_id,
      botId: tokenData.bot_id,
      appToken: tokenData.app_token,
      webhookSecret: tokenData.webhook_secret,
      createdAt: new Date().toISOString(),
    };
    store.saveInstallation(installation);

    console.log(`[OAuth] 安装成功: ${installation.id}`);

    // 将用户在 setup 页面填写的钉钉 Key 加密存储到本地
    if (userConfig && Object.values(userConfig).some((v) => v)) {
      store.saveConfig(installation.id, userConfig);
      console.log("[OAuth] 用户配置已加密存储");
    }

    // 成功后同步工具定义到 Hub
    const hubClient = new HubClient(installation.hubUrl, installation.appToken);
    if (tools && tools.length > 0) {
      await hubClient.syncTools(tools).catch((err) => {
        console.error("[OAuth] 同步工具失败:", err);
      });
    }

    // 重定向到 returnUrl（如果有的话），否则返回成功页面
    if (returnUrl) {
      res.writeHead(302, { Location: returnUrl });
      res.end();
    } else {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"><title>安装成功</title></head>
          <body>
            <h1>钉钉 Bridge 安装成功!</h1>
            <p>Installation ID: ${installation.id}</p>
            <p>你可以关闭此页面。</p>
          </body>
        </html>
      `);
    }
  } catch (err) {
    console.error("[OAuth] 异常:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "内部错误" }));
  }
}
