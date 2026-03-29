/**
 * Webhook 处理模块
 * 接收 Hub 推送的事件，验证签名后分发处理
 * command 事件支持同步/异步响应模式（SYNC_DEADLINE = 2500ms）
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { verifySignature } from "../utils/crypto.js";
import type { Store } from "../store.js";
import type { HubEvent, ToolResult } from "./types.js";
import { HubClient } from "./client.js";

/** 同步响应截止时间（毫秒），超过此时间返回 reply_async */
const SYNC_DEADLINE = 2500;

/** command 事件处理器类型，返回文本或 ToolResult */
export type CommandHandler = (
  event: HubEvent,
  installationId: string,
) => Promise<string | ToolResult>;

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
 * 将 command 处理结果格式化为同步响应体
 * 支持纯文本和 ToolResult 媒体类型
 */
function formatCommandReply(result: string | ToolResult): Record<string, unknown> {
  if (typeof result === "string") {
    return { reply: result };
  }
  // ToolResult 对象
  const resp: Record<string, unknown> = { reply: result.reply };
  if (result.reply_type) resp.reply_type = result.reply_type;
  if (result.reply_url) resp.reply_url = result.reply_url;
  if (result.reply_base64) resp.reply_base64 = result.reply_base64;
  if (result.reply_name) resp.reply_name = result.reply_name;
  return resp;
}

/**
 * 处理 POST /hub/webhook
 *
 * 请求头:
 *  - X-Timestamp: 时间戳
 *  - X-Signature: HMAC-SHA256 签名（"sha256=" + hex）
 *
 * 流程:
 * 1. 先处理 url_verification（无需签名验证）
 * 2. 查找安装信息，验证签名
 * 3. command 事件: Promise.race 2500ms，超时返回 reply_async
 * 4. 非 command: 调 onEvent，返回 {ok: true}
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

  // URL 验证（Hub 首次注册时发送），优先处理，无需签名验证
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

  // 验证签名（X-Timestamp + X-Signature）
  const timestamp = req.headers["x-timestamp"] as string | undefined;
  const signature = req.headers["x-signature"] as string | undefined;

  if (!timestamp || !signature) {
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

    // 使用 Promise.race + Symbol 哨兵实现 deadline 控制
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
        .then(async (asyncResult) => {
          const hubClient = new HubClient(installation.hubUrl, installation.appToken);
          const data = event.event?.data ?? {};
          const to =
            (data.group as { id?: string })?.id ??
            (data.sender as { id?: string })?.id ??
            (data.user_id as string) ??
            (data.from as string) ??
            "";
          if (typeof asyncResult === "string") {
            await hubClient.sendText(to, asyncResult, event.trace_id);
          } else {
            // ToolResult 带媒体
            await hubClient.sendMessage(to, asyncResult.reply_type ?? "text", asyncResult.reply, {
              url: asyncResult.reply_url,
              base64: asyncResult.reply_base64,
              filename: asyncResult.reply_name,
              traceId: event.trace_id,
            });
          }
        })
        .catch((err) => {
          console.error(`[Webhook] command 异步执行异常 (trace=${event.trace_id}):`, err);
        });
    } else {
      // 在 deadline 内完成：同步返回结果
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(formatCommandReply(result)));
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
