/**
 * 钉钉 → 微信 消息转发桥接
 * 收到钉钉消息后，转发到微信用户
 */

import type { DingtalkMessageData } from '../dingtalk/event.js';
import type { Installation, MessageLink } from '../hub/types.js';
import type { Store } from '../store.js';

/**
 * 钉钉到微信的消息转发处理器
 */
export class DingtalkToWx {
  private store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  /**
   * 处理钉钉消息并转发到微信
   * @param data - 钉钉消息数据
   * @param installations - 所有已安装的 Hub 实例
   */
  async handleDingtalkMessage(
    data: DingtalkMessageData,
    installations: Installation[],
  ): Promise<void> {
    // 清除 @提及 内容
    const cleanedContent = this.stripMentions(data.content);

    if (!cleanedContent.trim()) {
      // 消息为空（可能只有 @提及），跳过
      return;
    }

    // 查找关联的微信用户
    const link = this.findMatchingLink(data, installations);

    if (!link) {
      console.warn(
        '[DingtalkToWx] 未找到关联的微信用户',
        { conversationId: data.conversationId, msgId: data.msgId },
      );
      // 保存消息关联，方便后续匹配
      this.saveDingtalkMessage(data, installations);
      return;
    }

    // 查找对应的 Installation
    const installation = installations.find((inst) => inst.id === link.installationId);
    if (!installation) {
      console.error(
        '[DingtalkToWx] 未找到关联的 Installation:',
        link.installationId,
      );
      return;
    }

    // 通过 Hub API 转发消息到微信
    await this.sendToWx(installation, link, cleanedContent);

    // 更新消息关联
    try {
      this.store.saveMessageLink({
        installationId: link.installationId,
        dingtalkConversationId: data.conversationId,
        dingtalkMsgId: data.msgId,
        wxUserId: link.wxUserId,
        wxUserName: link.wxUserName,
      });
    } catch (err) {
      console.error('[DingtalkToWx] 保存 MessageLink 失败:', err);
    }
  }

  /**
   * 清除消息中的 @提及 内容
   * 钉钉消息中 @人 的格式为 @昵称 ，前后可能有空格
   */
  private stripMentions(content: string): string {
    // 移除 @xxx 格式的提及（包含后续的空格）
    return content.replace(/@\S+\s*/g, '').trim();
  }

  /**
   * 查找与钉钉消息匹配的微信用户关联
   * 遍历所有安装实例，按 msgId 精确匹配
   */
  private findMatchingLink(data: DingtalkMessageData, installations: Installation[]): MessageLink | undefined {
    // 按钉钉消息 ID 查找（精确匹配，用于回复场景），遍历所有安装实例
    if (data.msgId) {
      for (const inst of installations) {
        const link = this.store.getMessageLinkByDingtalkMsg(data.msgId, inst.id);
        if (link) return link;
      }
    }

    // 如果没有精确匹配，返回 undefined
    // 后续可以扩展按 conversationId 的模糊匹配
    return undefined;
  }

  /**
   * 保存钉钉消息记录（用于后续关联）
   */
  private saveDingtalkMessage(
    data: DingtalkMessageData,
    installations: Installation[],
  ): void {
    if (installations.length === 0) return;

    // 使用第一个可用的 installation
    const installation = installations[0]!;
    try {
      this.store.saveMessageLink({
        installationId: installation.id,
        dingtalkConversationId: data.conversationId,
        dingtalkMsgId: data.msgId,
        wxUserId: '',
        wxUserName: '',
      });
    } catch (err) {
      console.error('[DingtalkToWx] 保存钉钉消息关联失败:', err);
    }
  }

  /**
   * 通过 Hub API 发送消息到微信
   */
  private async sendToWx(
    installation: Installation,
    link: MessageLink,
    content: string,
  ): Promise<void> {
    const hubUrl = installation.hubUrl;
    const appToken = installation.appToken;

    // 构造 Hub API 请求：发送文本消息到微信用户
    const payload = {
      type: 'message.text',
      data: {
        toId: link.wxUserId,
        toName: link.wxUserName,
        content,
      },
    };

    try {
      const resp = await fetch(`${hubUrl}/api/v1/bot/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${appToken}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`Hub API 返回错误: HTTP ${resp.status} ${text}`);
      }

      console.log(
        '[DingtalkToWx] 成功转发消息到微信:',
        { wxUserId: link.wxUserId, wxUserName: link.wxUserName },
      );
    } catch (err) {
      console.error('[DingtalkToWx] 发送微信消息失败:', err);
      throw err;
    }
  }
}
