/**
 * 钉钉 SDK 封装
 * 提供 access_token 管理、webhook 回复、OpenAPI 发送、媒体上传等能力
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

/** 默认请求超时时间（毫秒） */
const REQUEST_TIMEOUT = 30_000;

/** access_token 提前刷新时间（毫秒），到期前 5 分钟 */
const TOKEN_REFRESH_AHEAD = 5 * 60 * 1000;

/**
 * 创建带超时的 AbortSignal
 */
function timeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

export class DingtalkClient {
  private clientId: string;
  private clientSecret: string;
  private robotCode: string;
  private accessToken: string = '';
  private tokenExpiresAt: number = 0;

  constructor(clientId: string, clientSecret: string, robotCode?: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    // robotCode 默认使用 clientId
    this.robotCode = robotCode ?? clientId;
  }

  /**
   * 获取 access_token（自动缓存，过期前 5 分钟刷新）
   */
  async getAccessToken(): Promise<string> {
    const now = Date.now();
    // 如果 token 尚未过期（含提前量），直接返回缓存
    if (this.accessToken && now < this.tokenExpiresAt - TOKEN_REFRESH_AHEAD) {
      return this.accessToken;
    }

    const url = new URL('https://oapi.dingtalk.com/gettoken');
    url.searchParams.set('appkey', this.clientId);
    url.searchParams.set('appsecret', this.clientSecret);

    const resp = await fetch(url.toString(), {
      method: 'GET',
      signal: timeoutSignal(REQUEST_TIMEOUT),
    });

    if (!resp.ok) {
      throw new Error(`获取 access_token 失败: HTTP ${resp.status}`);
    }

    const body = (await resp.json()) as {
      errcode: number;
      errmsg: string;
      access_token: string;
      expires_in: number;
    };

    if (body.errcode !== 0) {
      throw new Error(`获取 access_token 失败: ${body.errmsg} (${body.errcode})`);
    }

    this.accessToken = body.access_token;
    // expires_in 单位为秒，转换为毫秒
    this.tokenExpiresAt = now + body.expires_in * 1000;

    return this.accessToken;
  }

  /**
   * 通过 sessionWebhook 回复消息（最简单的方式）
   * @param webhook - 钉钉返回的临时 webhook URL
   * @param msgtype - 消息类型，如 text / markdown / actionCard 等
   * @param content - 消息体内容
   */
  async replyViaWebhook(
    webhook: string,
    msgtype: string,
    content: Record<string, any>,
  ): Promise<void> {
    const payload = {
      msgtype,
      [msgtype]: content,
    };

    const resp = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: timeoutSignal(REQUEST_TIMEOUT),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`webhook 回复失败: HTTP ${resp.status} ${text}`);
    }
  }

  /**
   * 通过 sessionWebhook 回复文本
   */
  async replyText(webhook: string, text: string): Promise<void> {
    await this.replyViaWebhook(webhook, 'text', { content: text });
  }

  /**
   * 通过 sessionWebhook 回复 Markdown
   */
  async replyMarkdown(webhook: string, title: string, text: string): Promise<void> {
    await this.replyViaWebhook(webhook, 'markdown', { title, text });
  }

  /**
   * 通过 OpenAPI 发送单聊消息
   * @param userIds - 目标用户 staffId 列表
   * @param msgKey - 消息模板 key，如 sampleText / sampleMarkdown
   * @param msgParam - 消息参数 JSON 字符串
   */
  async sendToUser(userIds: string[], msgKey: string, msgParam: string): Promise<void> {
    const token = await this.getAccessToken();

    const resp = await fetch('https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-acs-dingtalk-access-token': token,
      },
      body: JSON.stringify({
        robotCode: this.robotCode,
        userIds,
        msgKey,
        msgParam,
      }),
      signal: timeoutSignal(REQUEST_TIMEOUT),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`发送单聊消息失败: HTTP ${resp.status} ${text}`);
    }
  }

  /**
   * 通过 OpenAPI 发送群聊消息
   * @param openConversationId - 群会话 ID
   * @param msgKey - 消息模板 key
   * @param msgParam - 消息参数 JSON 字符串
   */
  async sendToGroup(
    openConversationId: string,
    msgKey: string,
    msgParam: string,
  ): Promise<void> {
    const token = await this.getAccessToken();

    const resp = await fetch('https://api.dingtalk.com/v1.0/robot/groupMessages/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-acs-dingtalk-access-token': token,
      },
      body: JSON.stringify({
        robotCode: this.robotCode,
        openConversationId,
        msgKey,
        msgParam,
      }),
      signal: timeoutSignal(REQUEST_TIMEOUT),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`发送群聊消息失败: HTTP ${resp.status} ${text}`);
    }
  }

  /**
   * 上传媒体文件获取 mediaId
   * @param filePath - 本地文件路径
   * @param mediaType - 媒体类型：image / voice / video / file
   * @returns mediaId
   */
  async uploadMedia(filePath: string, mediaType: string): Promise<string> {
    const token = await this.getAccessToken();

    // 读取文件内容
    const fileBuffer = readFileSync(filePath);
    const fileName = basename(filePath);

    // 构造 multipart/form-data
    const formData = new FormData();
    formData.append('type', mediaType);
    formData.append('media', new Blob([fileBuffer]), fileName);

    const resp = await fetch(
      `https://oapi.dingtalk.com/media/upload?access_token=${token}`,
      {
        method: 'POST',
        body: formData,
        signal: timeoutSignal(REQUEST_TIMEOUT),
      },
    );

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`上传媒体文件失败: HTTP ${resp.status} ${text}`);
    }

    const body = (await resp.json()) as {
      errcode: number;
      errmsg: string;
      media_id: string;
    };

    if (body.errcode !== 0) {
      throw new Error(`上传媒体文件失败: ${body.errmsg} (${body.errcode})`);
    }

    return body.media_id;
  }
}
