/**
 * 待办工具模块
 * 提供创建待办、查看待办列表、完成待办等 3 个工具
 */

import type { DingtalkClient } from "../dingtalk/client.js";
import type { ToolModule, ToolDefinition, ToolHandler } from "./types.js";

/** 默认请求超时时间（毫秒） */
const REQUEST_TIMEOUT = 30_000;

/** 工具定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: "create_todo",
    description: "创建一个新的钉钉待办任务",
    command: "create_todo",
    parameters: {
      type: "object",
      properties: {
        subject: { type: "string", description: "待办主题" },
        due_time: {
          type: "string",
          description: "截止时间，ISO 8601 格式，可选",
        },
        description: {
          type: "string",
          description: "待办描述，可选",
        },
      },
      required: ["subject"],
    },
  },
  {
    name: "list_todos",
    description: "查看当前用户的待办任务列表",
    command: "list_todos",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: '待办状态，默认 "TODO"，可选 "DONE"',
        },
      },
    },
  },
  {
    name: "complete_todo",
    description: "将指定待办任务标记为已完成",
    command: "complete_todo",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "待办任务ID" },
      },
      required: ["task_id"],
    },
  },
];

/**
 * 创建待办工具的处理函数映射
 */
function createHandlers(client: DingtalkClient): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 创建待办
  handlers.set("create_todo", async (ctx) => {
    const { subject, due_time, description } = ctx.args;
    try {
      const token = await client.getAccessToken();
      // TODO: 需要当前用户的 unionId，此处使用 ctx.userId 作为 fallback
      const unionId = ctx.userId;
      const url = `https://api.dingtalk.com/v1.0/todo/users/${unionId}/tasks`;

      const body: Record<string, any> = {
        subject,
        creatorId: unionId,
      };
      if (due_time) {
        // 待办 API 的 dueTime 单位为毫秒时间戳
        body.dueTime = new Date(due_time).getTime();
      }
      if (description) {
        body.description = description;
      }

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-acs-dingtalk-access-token": token,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        return `创建待办失败: HTTP ${resp.status} ${errText}`;
      }

      const data = (await resp.json()) as {
        id?: string;
        subject?: string;
      };

      return `待办创建成功\n主题: ${data.subject ?? subject}\n任务ID: ${data.id ?? "未知"}`;
    } catch (err: any) {
      return `创建待办失败: ${err.message}`;
    }
  });

  // 查看待办列表
  handlers.set("list_todos", async (ctx) => {
    const status = ctx.args.status ?? "TODO";
    try {
      const token = await client.getAccessToken();
      // TODO: 需要当前用户的 unionId，此处使用 ctx.userId 作为 fallback
      const unionId = ctx.userId;
      // 待办列表使用 org/tasks/query 路径
      const url = `https://api.dingtalk.com/v1.0/todo/users/${unionId}/org/tasks/query`;

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-acs-dingtalk-access-token": token,
        },
        body: JSON.stringify({
          isDone: status === "DONE",
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        return `查询待办列表失败: HTTP ${resp.status} ${errText}`;
      }

      const data = (await resp.json()) as {
        todoCards?: Array<{
          taskId: string;
          subject: string;
          dueTime?: number;
          isDone?: boolean;
          description?: string;
        }>;
      };

      const todos = data.todoCards ?? [];
      if (todos.length === 0) {
        return `当前没有${status === "DONE" ? "已完成的" : "待处理的"}待办`;
      }

      const lines = todos.map((t, i) => {
        const dueStr = t.dueTime
          ? `截止: ${new Date(t.dueTime).toLocaleString("zh-CN")}`
          : "";
        return `${i + 1}. ${t.subject}${dueStr ? ` (${dueStr})` : ""}\n   ID: ${t.taskId}`;
      });

      return `${status === "DONE" ? "已完成" : "待处理"}待办共 ${todos.length} 条:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `查询待办列表失败: ${err.message}`;
    }
  });

  // 完成待办
  handlers.set("complete_todo", async (ctx) => {
    const { task_id } = ctx.args;
    try {
      const token = await client.getAccessToken();
      // TODO: 需要当前用户的 unionId，此处使用 ctx.userId 作为 fallback
      const unionId = ctx.userId;
      // 完成待办使用 executorStatus 路径（不含末尾 /update）
      const url = `https://api.dingtalk.com/v1.0/todo/users/${unionId}/tasks/${task_id}/executorStatus`;

      const resp = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-acs-dingtalk-access-token": token,
        },
        body: JSON.stringify({
          executorStatusList: [
            {
              id: unionId,
              isDone: true,
            },
          ],
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        return `完成待办失败: HTTP ${resp.status} ${errText}`;
      }

      return `待办 ${task_id} 已标记为完成`;
    } catch (err: any) {
      return `完成待办失败: ${err.message}`;
    }
  });

  return handlers;
}

export const todoTools: ToolModule = {
  definitions,
  createHandlers,
};
