/**
 * Tools 模块公共类型定义
 */

import type { DingtalkClient } from "../dingtalk/client.js";

/** 工具参数定义 */
export interface ToolDefinition {
  name: string;
  description: string;
  command: string;
  parameters?: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

/** 工具执行上下文 */
export interface ToolContext {
  installationId: string;
  botId: string;
  userId: string;
  traceId: string;
  args: Record<string, any>;
}

/** 工具处理函数 */
export type ToolHandler = (ctx: ToolContext) => Promise<string>;

/** 工具模块接口 */
export interface ToolModule {
  definitions: ToolDefinition[];
  createHandlers: (client: DingtalkClient) => Map<string, ToolHandler>;
}
