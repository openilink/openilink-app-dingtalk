/**
 * Hub Bot API 客户端
 * 通过 Hub 提供的 REST API 发送消息
 * 路径: POST {hubUrl}/bot/v1/message/send
 */

/** 发送消息的可选参数 */
interface SendMessageOptions {
  /** 媒体 URL */
  url?: string;
  /** Base64 编码的媒体内容 */
  base64?: string;
  /** 文件名 */
  filename?: string;
  /** 追踪 ID */
  traceId?: string;
}

export class HubClient {
  private hubUrl: string;
  private appToken: string;

  constructor(hubUrl: string, appToken: string) {
    this.hubUrl = hubUrl.replace(/\/+$/, "");
    this.appToken = appToken;
  }

  /**
   * 发送通用消息
   * POST {hubUrl}/bot/v1/message/send
   *
   * @param to      - 目标用户/群组 ID
   * @param type    - 消息类型（text / image / file 等）
   * @param content - 消息内容
   * @param options - 可选参数（url / base64 / filename / traceId）
   */
  async sendMessage(
    to: string,
    type: string,
    content: string,
    options?: SendMessageOptions,
  ): Promise<Record<string, unknown>> {
    const url = `${this.hubUrl}/bot/v1/message/send`;
    const traceId = options?.traceId ?? crypto.randomUUID();

    const body: Record<string, unknown> = { to, type, content };
    if (options?.url) body.url = options.url;
    if (options?.base64) body.base64 = options.base64;
    if (options?.filename) body.filename = options.filename;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.appToken}`,
        "X-Trace-Id": traceId,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Hub API 请求失败: ${res.status} ${res.statusText} — ${errText}`,
      );
    }

    return (await res.json()) as Record<string, unknown>;
  }

  /**
   * 发送文本消息
   * @param to      - 目标用户/群组 ID
   * @param text    - 文本内容
   * @param traceId - 追踪 ID（可选）
   */
  async sendText(to: string, text: string, traceId?: string): Promise<void> {
    await this.sendMessage(to, "text", text, { traceId });
  }

  /**
   * 发送图片消息
   * @param to      - 目标用户/群组 ID
   * @param url     - 图片 URL
   * @param traceId - 追踪 ID（可选）
   */
  async sendImage(to: string, url: string, traceId?: string): Promise<void> {
    await this.sendMessage(to, "image", "", { url, traceId });
  }

  /**
   * 同步工具定义到 Hub
   * PUT {hubUrl}/bot/v1/app/tools
   * @param tools - 工具定义数组
   */
  async syncTools(tools: Record<string, unknown>[]): Promise<void> {
    const url = `${this.hubUrl}/bot/v1/app/tools`;

    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.appToken}`,
        },
        body: JSON.stringify({ tools }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[HubClient] 同步工具失败: ${res.status} — ${errText}`);
      } else {
        console.log(`[HubClient] 工具同步成功，共 ${tools.length} 个`);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        console.error("[HubClient] 同步工具超时 (30s)");
      } else {
        console.error("[HubClient] 同步工具异常:", err);
      }
    }
  }
}
