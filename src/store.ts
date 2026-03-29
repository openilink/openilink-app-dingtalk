/**
 * 数据持久化层
 * 使用 better-sqlite3 实现 Installation 和 MessageLink 的 CRUD
 */

import Database from "better-sqlite3";
import type { Installation, MessageLink } from "./hub/types.js";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export class Store {
  private db: Database.Database;

  constructor(dbPath: string) {
    // 确保数据库目录存在
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);

    // 开启 WAL 模式提升并发性能
    this.db.pragma("journal_mode = WAL");

    this.migrate();
  }

  /** 初始化数据库表结构 */
  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS installations (
        id TEXT PRIMARY KEY,
        hub_url TEXT NOT NULL,
        app_id TEXT NOT NULL,
        bot_id TEXT NOT NULL,
        app_token TEXT NOT NULL,
        webhook_secret TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS message_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        installation_id TEXT NOT NULL,
        dingtalk_conversation_id TEXT NOT NULL,
        dingtalk_msg_id TEXT NOT NULL,
        wx_user_id TEXT NOT NULL,
        wx_user_name TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (installation_id) REFERENCES installations(id)
      );

      CREATE INDEX IF NOT EXISTS idx_message_links_dingtalk_msg
        ON message_links(dingtalk_msg_id);
      CREATE INDEX IF NOT EXISTS idx_message_links_wx_user
        ON message_links(wx_user_id, created_at DESC);
    `);
  }

  // ==================== Installation CRUD ====================

  /** 保存或更新安装信息 */
  saveInstallation(inst: Installation): void {
    this.db
      .prepare(
        `INSERT INTO installations (id, hub_url, app_id, bot_id, app_token, webhook_secret, created_at)
         VALUES (@id, @hubUrl, @appId, @botId, @appToken, @webhookSecret, @createdAt)
         ON CONFLICT(id) DO UPDATE SET
           hub_url = excluded.hub_url,
           app_id = excluded.app_id,
           bot_id = excluded.bot_id,
           app_token = excluded.app_token,
           webhook_secret = excluded.webhook_secret`
      )
      .run({
        id: inst.id,
        hubUrl: inst.hubUrl,
        appId: inst.appId,
        botId: inst.botId,
        appToken: inst.appToken,
        webhookSecret: inst.webhookSecret,
        createdAt: inst.createdAt ?? new Date().toISOString(),
      });
  }

  /** 根据 ID 获取安装信息 */
  getInstallation(id: string): Installation | undefined {
    const row = this.db
      .prepare("SELECT * FROM installations WHERE id = ?")
      .get(id) as Record<string, string> | undefined;
    return row ? this.rowToInstallation(row) : undefined;
  }

  /** 获取全部安装信息 */
  getAllInstallations(): Installation[] {
    const rows = this.db
      .prepare("SELECT * FROM installations")
      .all() as Record<string, string>[];
    return rows.map((r) => this.rowToInstallation(r));
  }

  /** 数据库行 → Installation 对象 */
  private rowToInstallation(row: Record<string, string>): Installation {
    return {
      id: row.id,
      hubUrl: row.hub_url,
      appId: row.app_id,
      botId: row.bot_id,
      appToken: row.app_token,
      webhookSecret: row.webhook_secret,
      createdAt: row.created_at,
    };
  }

  // ==================== MessageLink CRUD ====================

  /** 保存消息关联记录 */
  saveMessageLink(link: MessageLink): number {
    const result = this.db
      .prepare(
        `INSERT INTO message_links (installation_id, dingtalk_conversation_id, dingtalk_msg_id, wx_user_id, wx_user_name)
         VALUES (@installationId, @dingtalkConversationId, @dingtalkMsgId, @wxUserId, @wxUserName)`
      )
      .run({
        installationId: link.installationId,
        dingtalkConversationId: link.dingtalkConversationId,
        dingtalkMsgId: link.dingtalkMsgId,
        wxUserId: link.wxUserId,
        wxUserName: link.wxUserName,
      });
    return Number(result.lastInsertRowid);
  }

  /** 根据钉钉消息 ID 查找关联记录 */
  getMessageLinkByDingtalkMsg(msgId: string): MessageLink | undefined {
    const row = this.db
      .prepare("SELECT * FROM message_links WHERE dingtalk_msg_id = ?")
      .get(msgId) as Record<string, unknown> | undefined;
    return row ? this.rowToMessageLink(row) : undefined;
  }

  /** 获取某个微信用户最新的关联记录 */
  getLatestLinkByWxUser(wxUserId: string): MessageLink | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM message_links WHERE wx_user_id = ? ORDER BY created_at DESC LIMIT 1"
      )
      .get(wxUserId) as Record<string, unknown> | undefined;
    return row ? this.rowToMessageLink(row) : undefined;
  }

  /** 数据库行 → MessageLink 对象 */
  private rowToMessageLink(row: Record<string, unknown>): MessageLink {
    return {
      id: row.id as number,
      installationId: row.installation_id as string,
      dingtalkConversationId: row.dingtalk_conversation_id as string,
      dingtalkMsgId: row.dingtalk_msg_id as string,
      wxUserId: row.wx_user_id as string,
      wxUserName: row.wx_user_name as string,
      createdAt: row.created_at as string,
    };
  }

  /** 关闭数据库连接 */
  close(): void {
    this.db.close();
  }
}
