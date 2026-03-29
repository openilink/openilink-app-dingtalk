/**
 * 应用配置模块
 * 从环境变量读取配置，必填项缺失时抛出错误
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
  /** 钉钉应用 AppKey，必填 */
  dingtalkClientId: string;
  /** 钉钉应用 AppSecret，必填 */
  dingtalkClientSecret: string;
  /** 钉钉机器人 Code（用于主动发消息） */
  dingtalkRobotCode: string;
}

/**
 * 从环境变量加载配置
 * 必填字段缺失时抛出 Error
 */
export function loadConfig(): Config {
  const required = (key: string, label: string): string => {
    const val = process.env[key];
    if (!val) throw new Error(`缺少必填环境变量: ${key} (${label})`);
    return val;
  };

  return {
    port: process.env.PORT ?? "8084",
    hubUrl: required("HUB_URL", "OpeniLink Hub 地址"),
    baseUrl: required("BASE_URL", "本应用对外基础 URL"),
    dbPath: process.env.DB_PATH ?? "data/dingtalk.db",
    dingtalkClientId: required("DINGTALK_CLIENT_ID", "钉钉 AppKey"),
    dingtalkClientSecret: required("DINGTALK_CLIENT_SECRET", "钉钉 AppSecret"),
    dingtalkRobotCode: process.env.DINGTALK_ROBOT_CODE ?? "",
  };
}
