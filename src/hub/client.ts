/**
 * Hub Bot API 客户端
 * 通过 Hub 提供的 REST API 向微信发送消息
 */

/** 通用消息体类型 */
interface MessagePayload {
  type: string;
  to_user_id: string;
  [key: string]: unknown;
}

export class HubClient {
  private hubUrl: string;
  private appToken: string;
  /** 请求超时时间（毫秒） */
  private timeout = 30_000;

  constructor(hubUrl: string, appToken: string) {
    this.hubUrl = hubUrl.replace(/\/+$/, "");
    this.appToken = appToken;
  }

  /**
   * 发送文本消息
   * @param toUserId - 目标微信用户 ID
   * @param text     - 文本内容
   */
  async sendText(toUserId: string, text: string): Promise<void> {
    await this.sendMessage({
      type: "text",
      to_user_id: toUserId,
      text: { content: text },
    });
  }

  /**
   * 发送图片消息
   * @param toUserId - 目标微信用户 ID
   * @param imageUrl - 图片 URL
   */
  async sendImage(toUserId: string, imageUrl: string): Promise<void> {
    await this.sendMessage({
      type: "image",
      to_user_id: toUserId,
      image: { url: imageUrl },
    });
  }

  /**
   * 发送文件消息
   * @param toUserId - 目标微信用户 ID
   * @param fileUrl  - 文件 URL
   * @param fileName - 文件名
   */
  async sendFile(
    toUserId: string,
    fileUrl: string,
    fileName: string
  ): Promise<void> {
    await this.sendMessage({
      type: "file",
      to_user_id: toUserId,
      file: { url: fileUrl, name: fileName },
    });
  }

  /**
   * 同步工具定义到 Hub
   * PUT {hubUrl}/bot/v1/app/tools
   * @param tools - 工具定义数组
   */
  async syncTools(tools: Record<string, unknown>[]): Promise<void> {
    const url = `${this.hubUrl}/bot/v1/app/tools`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.appToken}`,
        },
        body: JSON.stringify({ tools }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[HubClient] 同步工具失败: ${res.status} — ${errText}`);
      } else {
        console.log(`[HubClient] 工具同步成功，共 ${tools.length} 个`);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        console.error(`[HubClient] 同步工具超时 (${this.timeout}ms)`);
      } else {
        console.error("[HubClient] 同步工具异常:", err);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 发送通用消息（底层方法）
   * @param payload - 消息体
   * @returns Hub API 响应
   */
  async sendMessage(payload: MessagePayload): Promise<Record<string, unknown>> {
    const url = `${this.hubUrl}/api/v1/bot/messages`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.appToken}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(
          `Hub API 请求失败: ${res.status} ${res.statusText} — ${errText}`
        );
      }

      return (await res.json()) as Record<string, unknown>;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error(`Hub API 请求超时 (${this.timeout}ms)`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
