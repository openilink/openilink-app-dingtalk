/**
 * 应用 Manifest 声明
 * 描述本 App 的能力，供 Hub 注册时读取
 */

import type { Config } from "../config.js";

/** Manifest 结构 */
export interface AppManifest {
  /** 应用标识 slug */
  slug: string;
  /** 显示名称 */
  name: string;
  /** 图标 */
  icon: string;
  /** 应用描述 */
  description: string;
  /** 订阅的事件类型列表 */
  events: string[];
  /** Hub 推送事件的 webhook 地址 */
  webhook_url: string;
  /** OAuth 安装入口 */
  setup_url: string;
}

/**
 * 生成应用 Manifest
 */
export function createManifest(config: Config): AppManifest {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");

  return {
    slug: "dingtalk-bridge",
    name: "钉钉 Bridge",
    icon: "\u{1F535}",
    description: "微信 ↔ 钉钉双向消息桥接 + 钉钉 AI Tools",
    events: ["message", "command"],
    webhook_url: `${baseUrl}/hub/webhook`,
    setup_url: `${baseUrl}/oauth/setup`,
  };
}
