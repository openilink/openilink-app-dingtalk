/**
 * 应用配置模块
 * 从环境变量读取配置
 * 注意：dingtalkClientId / dingtalkClientSecret / dingtalkRobotCode 在云端托管模式下为可选，
 * 用户会在 OAuth setup 页面自行填写并加密存储到本地数据库。
 */

export interface Config {
  /** HTTP 服务端口，默认 "8084" */
  port: string;
  /** OpeniLink Hub 地址，必填 */
  hubUrl: string;
  /** 本应用对外可访问的基础 URL，必填 */
  baseUrl: string;
  /** SQLite 数据库路径，默认 "data/dingtalk.db" */
  dbPath: string;
  /** 钉钉应用 AppKey（可选，云端托管模式下由用户在安装时填写） */
  dingtalkClientId: string;
  /** 钉钉应用 AppSecret（可选，云端托管模式下由用户在安装时填写） */
  dingtalkClientSecret: string;
  /** 钉钉机器人 Code（可选，用于主动发消息） */
  dingtalkRobotCode: string;
}

/**
 * 从环境变量加载配置
 * 只有 HUB_URL 和 BASE_URL 是必填，钉钉凭证在云端托管模式下由用户安装时填写
 */
export function loadConfig(): Config {
  const cfg: Config = {
    port: process.env.PORT ?? "8084",
    hubUrl: process.env.HUB_URL ?? "",
    baseUrl: process.env.BASE_URL ?? "",
    dbPath: process.env.DB_PATH ?? "data/dingtalk.db",
    dingtalkClientId: process.env.DINGTALK_CLIENT_ID ?? "",
    dingtalkClientSecret: process.env.DINGTALK_CLIENT_SECRET ?? "",
    dingtalkRobotCode: process.env.DINGTALK_ROBOT_CODE ?? "",
  };

  const missing: string[] = [];
  if (!cfg.hubUrl) missing.push("HUB_URL");
  if (!cfg.baseUrl) missing.push("BASE_URL");

  if (missing.length > 0) {
    throw new Error(`缺少必填环境变量: ${missing.join(", ")}`);
  }

  return cfg;
}
