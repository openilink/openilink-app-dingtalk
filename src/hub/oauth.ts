/**
 * OAuth2 + PKCE 安装流程
 *
 * 1. Hub 访问 /oauth/setup → 本模块生成 PKCE，重定向到 Hub 授权页
 * 2. Hub 授权完成后回调 /oauth/redirect → 用 code + code_verifier 换取 app_token
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { generatePKCE } from "../utils/crypto.js";
import type { Config } from "../config.js";
import type { Store } from "../store.js";
import type { Installation } from "./types.js";

/**
 * 临时存储 PKCE code_verifier（键为 state）
 * 生产环境应考虑过期清理
 */
const pendingStates = new Map<string, { codeVerifier: string; hubUrl: string }>();

/**
 * 处理 GET /oauth/setup
 * Hub 会将用户引导到此端点开始安装
 *
 * 查询参数:
 *  - hub_url: Hub 的地址
 *  - app_id: 应用 ID
 */
export function handleOAuthSetup(
  req: IncomingMessage,
  res: ServerResponse,
  config: Config
): void {
  const url = new URL(req.url ?? "/", config.baseUrl);
  const hubUrl = url.searchParams.get("hub_url");
  const appId = url.searchParams.get("app_id");

  if (!hubUrl || !appId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "缺少 hub_url 或 app_id 参数" }));
    return;
  }

  // 生成 PKCE 参数
  const { codeVerifier, codeChallenge } = generatePKCE();

  // 生成随机 state 防止 CSRF
  const state = crypto.randomUUID();
  pendingStates.set(state, { codeVerifier, hubUrl });

  // 5 分钟后自动清理，防止内存泄漏
  setTimeout(() => pendingStates.delete(state), 5 * 60 * 1000);

  // 构建 Hub 授权 URL
  const authorizeUrl = new URL("/oauth/authorize", hubUrl);
  authorizeUrl.searchParams.set("app_id", appId);
  authorizeUrl.searchParams.set("redirect_uri", `${config.baseUrl}/oauth/redirect`);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  // 重定向到 Hub 授权页
  res.writeHead(302, { Location: authorizeUrl.toString() });
  res.end();
}

/**
 * 处理 GET /oauth/redirect
 * Hub 授权完成后回调此端点
 *
 * 查询参数:
 *  - code: 授权码
 *  - state: 之前传出的 state
 */
export async function handleOAuthRedirect(
  req: IncomingMessage,
  res: ServerResponse,
  config: Config,
  store: Store
): Promise<void> {
  const url = new URL(req.url ?? "/", config.baseUrl);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "缺少 code 或 state 参数" }));
    return;
  }

  // 查找并消费 state 对应的 code_verifier
  const pending = pendingStates.get(state);
  if (!pending) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "无效或已过期的 state" }));
    return;
  }
  pendingStates.delete(state);

  try {
    // 用 code + code_verifier 换取 app_token
    const tokenUrl = new URL("/api/v1/oauth/token", pending.hubUrl);
    const tokenRes = await fetch(tokenUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        code_verifier: pending.codeVerifier,
        redirect_uri: `${config.baseUrl}/oauth/redirect`,
      }),
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
      hubUrl: pending.hubUrl,
      appId: tokenData.app_id,
      botId: tokenData.bot_id,
      appToken: tokenData.app_token,
      webhookSecret: tokenData.webhook_secret,
      createdAt: new Date().toISOString(),
    };
    store.saveInstallation(installation);

    console.log(`[OAuth] 安装成功: ${installation.id}`);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        message: "安装成功",
        installation_id: installation.id,
      })
    );
  } catch (err) {
    console.error("[OAuth] 异常:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "内部错误" }));
  }
}
