/**
 * Webhook 处理模块
 * 接收 Hub 推送的微信消息事件，验证签名后分发处理
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { verifySignature } from "../utils/crypto.js";
import type { Store } from "../store.js";
import type { HubEvent } from "./types.js";

/**
 * 从 IncomingMessage 中读取完整的请求体
 */
export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/**
 * 处理 POST /hub/webhook
 *
 * 请求头:
 *  - x-hub-signature: HMAC-SHA256 签名（hex）
 *  - x-hub-timestamp: 时间戳
 *
 * @param onEvent - 签名验证通过后的事件回调
 */
export async function handleWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  store: Store,
  onEvent: (event: HubEvent) => Promise<void>
): Promise<void> {
  // 仅接受 POST 方法
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "仅支持 POST 方法" }));
    return;
  }

  const body = await readBody(req);
  let event: HubEvent;

  try {
    event = JSON.parse(body) as HubEvent;
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "无效的 JSON" }));
    return;
  }

  // URL 验证（Hub 首次注册时发送）
  if (event.type === "url_verification") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ challenge: event.challenge }));
    return;
  }

  // 查找安装信息以验证签名
  const installation = store.getInstallation(event.installation_id);
  if (!installation) {
    console.warn(`[Webhook] 未知的安装 ID: ${event.installation_id}`);
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "未知的安装" }));
    return;
  }

  // 验证签名
  const signature = req.headers["x-hub-signature"] as string | undefined;
  const timestamp = req.headers["x-hub-timestamp"] as string | undefined;

  if (!signature || !timestamp) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "缺少签名头" }));
    return;
  }

  if (!verifySignature(installation.webhookSecret, timestamp, body, signature)) {
    console.warn(`[Webhook] 签名验证失败: ${event.installation_id}`);
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "签名验证失败" }));
    return;
  }

  // 先返回 200，然后异步处理事件（避免 Hub 超时重试）
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));

  // 异步处理事件
  try {
    await onEvent(event);
  } catch (err) {
    console.error(`[Webhook] 事件处理异常 (trace=${event.trace_id}):`, err);
  }
}
