/**
 * Tools 注册中心
 * 汇总所有工具模块，统一注册到 Hub
 */

import type { DingtalkClient } from "../dingtalk/client.js";
import type { ToolDefinition, ToolHandler, ToolModule } from "./types.js";
import { messagingTools } from "./messaging.js";
import { contactsTools } from "./contacts.js";
import { calendarTools } from "./calendar.js";
import { todoTools } from "./todo.js";
import { workflowTools } from "./workflow.js";
import { attendanceTools } from "./attendance.js";
import { driveTools } from "./drive.js";

/** 所有工具模块列表 */
const allModules: ToolModule[] = [
  messagingTools,
  contactsTools,
  calendarTools,
  todoTools,
  workflowTools,
  attendanceTools,
  driveTools,
];

/**
 * 收集所有工具定义和处理函数
 * @param client - 钉钉客户端实例
 * @returns definitions 和 handlers
 */
export function collectAllTools(client: DingtalkClient): {
  definitions: ToolDefinition[];
  handlers: Map<string, ToolHandler>;
} {
  const definitions: ToolDefinition[] = [];
  const handlers = new Map<string, ToolHandler>();

  for (const mod of allModules) {
    // 收集定义
    definitions.push(...mod.definitions);

    // 收集处理函数
    const modHandlers = mod.createHandlers(client);
    for (const [name, handler] of modHandlers) {
      if (handlers.has(name)) {
        console.warn(`[Tools] 工具名称冲突: ${name}，后者将覆盖前者`);
      }
      handlers.set(name, handler);
    }
  }

  console.log(`[Tools] 共注册 ${definitions.length} 个工具，${handlers.size} 个处理函数`);
  return { definitions, handlers };
}

// 重新导出类型，方便外部使用
export type { ToolDefinition, ToolContext, ToolHandler, ToolModule } from "./types.js";
