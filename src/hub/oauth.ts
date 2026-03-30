/**
 * OAuth2 + PKCE 安装流程
 *
 * 1. Hub 访问 /oauth/setup → 本模块生成 PKCE，重定向到 Hub 授权页
 *    查询参数: hub, app_id, bot_id, state(hub_state), return_url
 * 2. Hub 授权完成后回调 /oauth/redirect → 用 code + code_verifier 换取安装信息
 *    Exchange: POST {hub}/api/apps/{appId}/oauth/exchange body: {code, code_verifier}
 * 3. 成功后同步 tools + 重定向到 returnUrl
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { generatePKCE } from "../utils/crypto.js";
import type { Config } from "../config.js";
import type { Store } from "../store.js";
import type { Installation } from "./types.js";
import { HubClient } from "./client.js";

/**
 * 临时存储 PKCE localState → {verifier, hub, appId, returnUrl}
 * 生产环境应考虑过期清理
 */
const pendingStates = new Map<
  string,
  { verifier: string; hub: string; appId: string; returnUrl: string }
>();

/**
 * 处理 GET /oauth/setup
 * Hub 会将用户引导到此端点开始安装
 *
 * 查询参数:
 *  - hub: Hub 地址
 *  - app_id: 应用 ID
 *  - bot_id: Bot ID
 *  - state: Hub 侧传来的 state（hub_state）
 *  - return_url: 安装完成后重定向地址
 */
export function handleOAuthSetup(
  req: IncomingMessage,
  res: ServerResponse,
  config: Config,
): void {
  const url = new URL(req.url ?? "/", config.baseUrl);
  const hub = url.searchParams.get("hub");
  const appId = url.searchParams.get("app_id");
  const botId = url.searchParams.get("bot_id") ?? "";
  const hubState = url.searchParams.get("state") ?? "";
  const returnUrl = url.searchParams.get("return_url") ?? "";

  if (!hub || !appId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "缺少 hub 或 app_id 参数" }));
    return;
  }

  // 生成 PKCE 参数
  const { codeVerifier, codeChallenge } = generatePKCE();

  // 生成本地随机 localState，缓存关键信息
  const localState = crypto.randomUUID();
  pendingStates.set(localState, {
    verifier: codeVerifier,
    hub,
    appId,
    returnUrl,
  });

  // 5 分钟后自动清理，防止内存泄漏
  setTimeout(() => pendingStates.delete(localState), 5 * 60 * 1000);

  // 构建 Hub 授权 URL: {hub}/api/apps/{appId}/oauth/authorize
  const authorizeUrl = new URL(`/api/apps/${appId}/oauth/authorize`, hub);
  if (botId) authorizeUrl.searchParams.set("bot_id", botId);
  authorizeUrl.searchParams.set("state", localState);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  if (hubState) authorizeUrl.searchParams.set("hub_state", hubState);

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
 *  - state: 之前传出的 localState
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

  // 查找并消费 state 对应的缓存信息
  const pending = pendingStates.get(state);
  if (!pending) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "无效或已过期的 state" }));
    return;
  }
  pendingStates.delete(state);

  try {
    // 用 code + code_verifier 换取安装信息
    // POST {hub}/api/apps/{appId}/oauth/exchange
    const exchangeUrl = `${pending.hub.replace(/\/+$/, "")}/api/apps/${pending.appId}/oauth/exchange`;
    const tokenRes = await fetch(exchangeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        code_verifier: pending.verifier,
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
      hubUrl: pending.hub,
      appId: tokenData.app_id,
      botId: tokenData.bot_id,
      appToken: tokenData.app_token,
      webhookSecret: tokenData.webhook_secret,
      createdAt: new Date().toISOString(),
    };
    store.saveInstallation(installation);

    console.log(`[OAuth] 安装成功: ${installation.id}`);

    // 成功后同步工具定义到 Hub
    const hubClient = new HubClient(installation.hubUrl, installation.appToken);
    if (tools && tools.length > 0) {
      await hubClient.syncTools(tools).catch((err) => {
        console.error("[OAuth] 同步工具失败:", err);
      });
    }

    // 安装成功后异步拉取用户配置并加密存储到本地
    hubClient.fetchConfig().then((cfg) => {
      if (Object.keys(cfg).length > 0) {
        store.saveConfig(installation.id, cfg);
        console.log("[OAuth] 用户配置已拉取并加密存储");
      }
    }).catch((e) => console.error("[OAuth] 拉取用户配置失败:", e));

    // 重定向到 returnUrl（如果有的话），否则返回 JSON
    if (pending.returnUrl) {
      res.writeHead(302, { Location: pending.returnUrl });
      res.end();
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          message: "安装成功",
          installation_id: installation.id,
        }),
      );
    }
  } catch (err) {
    console.error("[OAuth] 异常:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "内部错误" }));
  }
}
