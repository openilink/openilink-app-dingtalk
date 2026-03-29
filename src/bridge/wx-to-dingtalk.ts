/**
 * 微信 → 钉钉 消息转发桥接
 * 收到微信消息后，转发到钉钉会话中
 */

import type { DingtalkClient } from '../dingtalk/client.js';
import type { HubEvent, Installation, MessageLink } from '../hub/types.js';
import type { Store } from '../store.js';

/**
 * 微信到钉钉的消息转发处理器
 *
 * 策略说明：
 * 钉钉不像 Slack/Discord 有默认频道概念，需要明确发送目标。
 * 维护一个"最近活跃会话"的 sessionWebhook 缓存：
 * - 如果某钉钉用户曾给机器人发过消息，就用其 sessionWebhook 回复
 * - 否则尝试通过 OpenAPI 发送（需要知道目标用户 ID 或群会话 ID）
 */
export class WxToDingtalk {
  private dingtalkClient: DingtalkClient;
  private store: Store;

  /**
   * sessionWebhook 缓存
   * key: conversationId
   * value: { webhook, senderStaffId, updatedAt }
   */
  private webhookCache: Map<
    string,
    { webhook: string; senderStaffId: string; updatedAt: number }
  > = new Map();

  constructor(dingtalkClient: DingtalkClient, store: Store) {
    this.dingtalkClient = dingtalkClient;
    this.store = store;
  }

  /**
   * 更新 sessionWebhook 缓存
   * 每次收到钉钉消息时调用，保持缓存最新
   */
  updateWebhookCache(
    conversationId: string,
    webhook: string,
    senderStaffId: string,
  ): void {
    this.webhookCache.set(conversationId, {
      webhook,
      senderStaffId,
      updatedAt: Date.now(),
    });
  }

  /**
   * 处理微信事件并转发到钉钉
   */
  async handleWxEvent(event: HubEvent, installation: Installation): Promise<void> {
    if (!event.event) {
      return;
    }

    const { type: eventType, data } = event.event;

    // 跳过命令类型事件
    if (eventType === 'command') {
      return;
    }

    // 构造转发内容
    const forwarded = this.formatMessage(eventType, data);
    if (!forwarded) {
      return;
    }

    const { title, text } = forwarded;

    // 查找目标钉钉会话
    await this.forwardToDingtalk(title, text, data, installation);
  }

  /**
   * 根据事件类型格式化消息
   */
  private formatMessage(
    eventType: string,
    data: Record<string, unknown>,
  ): { title: string; text: string } | null {
    const fromName = String(data.fromName ?? data.from_name ?? '未知用户');
    const prefix = `**[微信] ${fromName}**`;

    switch (eventType) {
      case 'message.text': {
        const content = String(data.content ?? data.text ?? '');
        if (!content) return null;
        return {
          title: `[微信] ${fromName}`,
          text: `${prefix}\n\n${content}`,
        };
      }

      case 'message.image':
        return {
          title: `[微信] ${fromName}`,
          text: `${prefix}\n\n[发送了图片]`,
        };

      case 'message.voice':
        return {
          title: `[微信] ${fromName}`,
          text: `${prefix}\n\n[发送了语音]`,
        };

      case 'message.video':
        return {
          title: `[微信] ${fromName}`,
          text: `${prefix}\n\n[发送了视频]`,
        };

      case 'message.file':
        return {
          title: `[微信] ${fromName}`,
          text: `${prefix}\n\n[发送了文件]`,
        };

      case 'message.location':
        return {
          title: `[微信] ${fromName}`,
          text: `${prefix}\n\n[发送了位置]`,
        };

      case 'message.link':
        return {
          title: `[微信] ${fromName}`,
          text: `${prefix}\n\n[发送了链接]`,
        };

      default: {
        // 未知消息类型，给出通用提示
        if (eventType.startsWith('message.')) {
          return {
            title: `[微信] ${fromName}`,
            text: `${prefix}\n\n[发送了一条消息 (${eventType})]`,
          };
        }
        // 非消息类型事件，跳过
        return null;
      }
    }
  }

  /**
   * 将消息转发到钉钉
   * 优先使用 webhook 缓存，其次使用 OpenAPI
   */
  private async forwardToDingtalk(
    title: string,
    text: string,
    data: Record<string, unknown>,
    installation: Installation,
  ): Promise<void> {
    const wxUserId = String(data.fromId ?? data.from_id ?? '');
    const wxUserName = String(data.fromName ?? data.from_name ?? '');

    // 1. 查找 store 中最近的 MessageLink，获取 conversationId
    let link: MessageLink | undefined;
    if (wxUserId) {
      link = this.store.getLatestLinkByWxUser(wxUserId);
    }

    const conversationId = link?.dingtalkConversationId ?? '';

    // 2. 尝试使用 sessionWebhook 缓存回复
    if (conversationId) {
      const cached = this.webhookCache.get(conversationId);
      if (cached) {
        try {
          await this.dingtalkClient.replyMarkdown(cached.webhook, title, text);
          // 转发成功，保存 MessageLink
          this.saveLink(installation.id, conversationId, '', wxUserId, wxUserName);
          return;
        } catch (err) {
          // webhook 可能已过期，继续尝试 OpenAPI
          console.warn('[WxToDingtalk] webhook 回复失败，尝试 OpenAPI:', err);
        }
      }
    }

    // 3. 使用 OpenAPI 发送
    // 需要知道目标用户的 staffId 或群会话 ID
    if (link) {
      const msgParam = JSON.stringify({ title, text });

      // 查找 webhook 缓存中的 staffId
      const cached = conversationId ? this.webhookCache.get(conversationId) : undefined;

      if (cached?.senderStaffId) {
        // 使用 OpenAPI 单聊发送
        try {
          await this.dingtalkClient.sendToUser(
            [cached.senderStaffId],
            'sampleMarkdown',
            msgParam,
          );
          this.saveLink(installation.id, conversationId, '', wxUserId, wxUserName);
          return;
        } catch (err) {
          console.error('[WxToDingtalk] OpenAPI 单聊发送失败:', err);
        }
      }

      // 尝试群聊发送
      if (conversationId) {
        try {
          await this.dingtalkClient.sendToGroup(conversationId, 'sampleMarkdown', msgParam);
          this.saveLink(installation.id, conversationId, '', wxUserId, wxUserName);
          return;
        } catch (err) {
          console.error('[WxToDingtalk] OpenAPI 群聊发送失败:', err);
        }
      }
    }

    console.warn(
      '[WxToDingtalk] 无法转发消息：未找到可用的钉钉会话目标',
      { wxUserId, wxUserName },
    );
  }

  /**
   * 保存消息关联记录
   */
  private saveLink(
    installationId: string,
    conversationId: string,
    msgId: string,
    wxUserId: string,
    wxUserName: string,
  ): void {
    try {
      this.store.saveMessageLink({
        installationId,
        dingtalkConversationId: conversationId,
        dingtalkMsgId: msgId,
        wxUserId,
        wxUserName,
      });
    } catch (err) {
      console.error('[WxToDingtalk] 保存 MessageLink 失败:', err);
    }
  }
}
