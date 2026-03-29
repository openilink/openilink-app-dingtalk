/**
 * 钉钉 集成测试 — 通用工具函数
 *
 * 通过 OpeniLink Hub Mock Server 注入事件、查询已发消息、重置状态。
 */

/** Mock Hub 服务地址 */
export const MOCK_HUB_URL = "http://localhost:9801";

/** Mock 应用令牌 */
export const MOCK_APP_TOKEN = "mock_app_token";

/**
 * 向 Mock Server 注入一条模拟微信消息事件
 * Mock Server 会通过 Webhook 将事件推送给 App
 *
 * @param sender  - 发送者 ID（模拟微信用户）
 * @param content - 消息文本内容
 */
export async function injectMessage(
  sender: string,
  content: string,
): Promise<void> {
  const res = await fetch(`${MOCK_HUB_URL}/mock/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender, content }),
  });
  if (!res.ok) {
    throw new Error(
      `注入消息失败: ${res.status} ${await res.text()}`,
    );
  }
}

/**
 * 注入一条命令事件
 *
 * @param sender  - 发送者 ID
 * @param command - 命令名称（如 "/help"）
 * @param args    - 命令参数
 */
export async function injectCommand(
  sender: string,
  command: string,
  args: Record<string, unknown> = {},
): Promise<void> {
  const res = await fetch(`${MOCK_HUB_URL}/mock/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender, command, args }),
  });
  if (!res.ok) {
    throw new Error(
      `注入命令失败: ${res.status} ${await res.text()}`,
    );
  }
}

/**
 * 获取 Mock Server 记录的所有 App 发送的消息
 *
 * @returns 消息数组（由 Mock Server 记录的 /bot/v1/message/send 请求）
 */
export async function getMessages(): Promise<any[]> {
  const res = await fetch(`${MOCK_HUB_URL}/mock/messages`, {
    method: "GET",
  });
  if (!res.ok) {
    throw new Error(
      `获取消息失败: ${res.status} ${await res.text()}`,
    );
  }
  return res.json();
}

/**
 * 重置 Mock Server 状态（清空已记录的消息和事件）
 */
export async function resetMock(): Promise<void> {
  const res = await fetch(`${MOCK_HUB_URL}/mock/reset`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(
      `重置 Mock 失败: ${res.status} ${await res.text()}`,
    );
  }
}

/**
 * 等待条件满足，超时后抛出异常
 *
 * @param fn         - 返回 truthy 值表示条件满足
 * @param timeoutMs  - 超时时间（毫秒），默认 5000
 * @param intervalMs - 轮询间隔（毫秒），默认 200
 */
export async function waitFor(
  fn: () => Promise<unknown> | unknown,
  timeoutMs = 5000,
  intervalMs = 200,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (result) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor 超时（${timeoutMs}ms）`);
}
