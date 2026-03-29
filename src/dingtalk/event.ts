/**
 * 钉钉 Stream 模式事件处理
 * 使用 dingtalk-stream-sdk-nodejs 建立 WebSocket 长连接接收消息
 */

// @ts-expect-error dingtalk-stream-sdk-nodejs 没有类型定义
import DWClient from 'dingtalk-stream-sdk-nodejs';

/** 钉钉消息数据结构 */
export interface DingtalkMessageData {
  /** 会话 ID */
  conversationId: string;
  /** 会话类型："1"=单聊, "2"=群聊 */
  conversationType: string;
  /** 消息 ID */
  msgId: string;
  /** 消息类型 */
  msgtype: string;
  /** 文本内容（已去除 @机器人 部分） */
  content: string;
  /** 发送者员工 ID */
  senderStaffId: string;
  /** 发送者用户 ID */
  senderId: string;
  /** 临时 webhook URL，用于回复消息 */
  sessionWebhook: string;
  /** 消息创建时间戳 */
  createAt: number;
}

/** 钉钉消息处理回调函数 */
export type DingtalkMessageHandler = (data: DingtalkMessageData) => void | Promise<void>;

/**
 * 创建并启动钉钉 Stream 客户端
 * @param clientId - 钉钉应用的 AppKey
 * @param clientSecret - 钉钉应用的 AppSecret
 * @param onMessage - 收到消息时的回调处理函数
 * @returns DWClient 实例
 */
export function createDingtalkStream(
  clientId: string,
  clientSecret: string,
  onMessage: DingtalkMessageHandler,
): any {
  const client = new DWClient({
    clientId,
    clientSecret,
  });

  // 注册机器人消息回调
  client.registerCallbackListener(
    '/v1.0/im/bot/messages/get',
    async (event: any) => {
      try {
        const raw = JSON.parse(event.data);

        // 提取文本内容：text 类型取 text.content，其他类型尝试取 content
        let content = '';
        if (raw.text && typeof raw.text.content === 'string') {
          content = raw.text.content.trim();
        } else if (typeof raw.content === 'string') {
          content = raw.content.trim();
        }

        const data: DingtalkMessageData = {
          conversationId: raw.conversationId ?? '',
          conversationType: raw.conversationType ?? '',
          msgId: raw.msgId ?? '',
          msgtype: raw.msgtype ?? 'text',
          content,
          senderStaffId: raw.senderStaffId ?? '',
          senderId: raw.senderId ?? '',
          sessionWebhook: raw.sessionWebhook ?? '',
          createAt: raw.createAt ?? Date.now(),
        };

        await onMessage(data);
      } catch (err) {
        console.error('[钉钉 Stream] 处理消息时出错:', err);
      }

      // 返回成功响应
      return { status: 'SUCCESS', message: 'OK' };
    },
  );

  // 启动连接
  client.connect();

  return client;
}
