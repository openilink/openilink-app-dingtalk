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
  /** 权限范围 */
  scopes: string[];
  /** Hub 推送事件的 webhook 地址 */
  webhook_url: string;
  /** OAuth 安装入口 */
  setup_url: string;
  /** 安装引导说明（Markdown） */
  guide: string;
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
    scopes: ["message:read", "message:write", "tools:write", "config:read"],
    webhook_url: `${baseUrl}/hub/webhook`,
    setup_url: `${baseUrl}/oauth/setup`,
    guide: `## 钉钉 Bridge 安装指南

安装时会引导您配置钉钉 Key，请提前准备好以下信息：

### 第 1 步：创建钉钉应用
1. 访问 [open-dev.dingtalk.com](https://open-dev.dingtalk.com)
2. 应用开发 → 企业内部应用 → 创建应用
3. 在「基础信息」获取 **AppKey** 和 **AppSecret**

### 第 2 步：启用机器人
应用能力 → 机器人 → 启用

### 第 3 步：开启 Stream 模式
在机器人配置中选择「Stream 模式」

### 第 4 步：点击安装
安装过程中会显示配置页面，填写钉钉 AppKey、AppSecret 即可完成。
安装后可通过 /settings 页面随时修改配置。
`,
  };
}
