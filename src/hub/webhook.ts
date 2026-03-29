/**
 * Webhook 处理模块
 * 接收 Hub 推送的微信消息事件，验证签名后分发处理
 * command 事件支持同步/异步响应模式（SYNC_DEADLINE = 2500ms）
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { verifySignature } from "../utils/crypto.js";
import type { Store } from "../store.js";
import type { HubEvent } from "./types.js";
import { HubClient } from "./client.js";

/** 同步响应截止时间（毫秒），超过此时间返回 reply_async */
const SYNC_DEADLINE = 2500;

/** command 事件处理器类型，返回文本结果 */
export type CommandHandler = (
  event: HubEvent,
  installationId: string,
) => Promise<string>;

/** 非 command 事件处理器类型 */
export type EventHandler = (event: HubEvent) => Promise<void>;

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
 * command 事件使用 Promise.race + 2500ms deadline 实现同步/异步响应：
 * - 在 deadline 内完成 → 返回 {"reply": "结果"}
 * - 超时 → 返回 {"reply_async": true}，后台继续执行并通过 HubClient 异步推送
 *
 * @param onEvent - 非 command 事件回调
 * @param onCommand - command 事件处理器，返回结果字符串
 */
export async function handleWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  store: Store,
  onEvent: EventHandler,
  onCommand?: CommandHandler,
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

  // command 事件：同步/异步响应模式
  if (event.event?.type === "command" && onCommand) {
    const commandPromise = onCommand(event, event.installation_id);

    // 使用 Promise.race 实现 deadline 控制
    const timeoutSymbol = Symbol("timeout");
    const timeoutPromise = new Promise<typeof timeoutSymbol>((resolve) =>
      setTimeout(() => resolve(timeoutSymbol), SYNC_DEADLINE),
    );

    const result = await Promise.race([commandPromise, timeoutPromise]);

    if (result === timeoutSymbol) {
      // 超时：立即返回异步标记，后台继续执行
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ reply_async: true }));
      // 后台等待完成后通过 HubClient 异步推送结果
      commandPromise
        .then((asyncResult) => {
          const hubClient = new HubClient(installation.hubUrl, installation.appToken);
          const userId = (event.event?.data.user_id as string) || "";
          return hubClient.sendText(userId, asyncResult);
        })
        .catch((err) => {
          console.error(`[Webhook] command 异步执行异常 (trace=${event.trace_id}):`, err);
        });
    } else {
      // 在 deadline 内完成：同步返回结果
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ reply: result }));
    }
    return;
  }

  // 非 command 事件：先返回 200，再异步处理
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));

  try {
    await onEvent(event);
  } catch (err) {
    console.error(`[Webhook] 事件处理异常 (trace=${event.trace_id}):`, err);
  }
}
