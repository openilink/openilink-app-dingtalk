/**
 * 日历工具模块
 * 提供查看日程、创建日程、查忙闲等 3 个工具
 */

import type { DingtalkClient } from "../dingtalk/client.js";
import type { ToolModule, ToolDefinition, ToolHandler } from "./types.js";

/** 默认请求超时时间（毫秒） */
const REQUEST_TIMEOUT = 30_000;

/** 工具定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: "list_events",
    description: "查看指定用户的日程列表",
    command: "list_events",
    parameters: {
      type: "object",
      properties: {
        user_id: { type: "string", description: "用户的 unionId" },
        start_time: {
          type: "string",
          description: "起始时间，ISO 8601 格式（如 2024-01-01T00:00:00Z），可选",
        },
        end_time: {
          type: "string",
          description: "结束时间，ISO 8601 格式（如 2024-01-31T23:59:59Z），可选",
        },
      },
      required: ["user_id"],
    },
  },
  {
    name: "create_event",
    description: "创建一个新的日程",
    command: "create_event",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "日程标题" },
        start_time: {
          type: "string",
          description: "开始时间，ISO 8601 格式",
        },
        end_time: {
          type: "string",
          description: "结束时间，ISO 8601 格式",
        },
        description: {
          type: "string",
          description: "日程描述，可选",
        },
      },
      required: ["summary", "start_time", "end_time"],
    },
  },
  {
    name: "get_free_busy",
    description: "查询多个用户在指定时间段的忙闲状态",
    command: "get_free_busy",
    parameters: {
      type: "object",
      properties: {
        user_ids: {
          type: "string",
          description: "用户 unionId 列表，逗号分隔",
        },
        start_time: {
          type: "string",
          description: "起始时间，ISO 8601 格式",
        },
        end_time: {
          type: "string",
          description: "结束时间，ISO 8601 格式",
        },
      },
      required: ["user_ids", "start_time", "end_time"],
    },
  },
];

/**
 * 创建日历工具的处理函数映射
 */
function createHandlers(client: DingtalkClient): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 查看日程列表（使用 POST 方法，参数通过 JSON body 传递）
  handlers.set("list_events", async (ctx) => {
    const { user_id, start_time, end_time } = ctx.args;
    try {
      const token = await client.getAccessToken();
      const url = `https://api.dingtalk.com/v1.0/calendar/users/${user_id}/calendars/primary/events`;

      // 构造请求体
      const body: Record<string, any> = {
        maxResults: 50,
      };
      if (start_time) body.timeMin = start_time;
      if (end_time) body.timeMax = end_time;

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
        return `查询日程失败: HTTP ${resp.status} ${errText}`;
      }

      const data = (await resp.json()) as {
        events?: Array<{
          id: string;
          summary: string;
          description?: string;
          start: { dateTime?: string; date?: string };
          end: { dateTime?: string; date?: string };
          status?: string;
        }>;
      };

      const events = data.events ?? [];
      if (events.length === 0) {
        return "该时间段内没有日程";
      }

      const lines = events.map((e, i) => {
        const startStr = e.start.dateTime ?? e.start.date ?? "未知";
        const endStr = e.end.dateTime ?? e.end.date ?? "未知";
        return `${i + 1}. ${e.summary}\n   时间: ${startStr} ~ ${endStr}${e.description ? `\n   描述: ${e.description}` : ""}`;
      });

      return `共找到 ${events.length} 个日程:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `查询日程失败: ${err.message}`;
    }
  });

  // 创建日程
  handlers.set("create_event", async (ctx) => {
    const { summary, start_time, end_time, description } = ctx.args;
    try {
      const token = await client.getAccessToken();
      // TODO: 创建日程需要当前操作用户的 unionId，此处使用 ctx.userId 作为 fallback
      const userId = ctx.userId;
      const url = `https://api.dingtalk.com/v1.0/calendar/users/${userId}/calendars/primary/events`;

      const body: Record<string, any> = {
        summary,
        start: { dateTime: start_time },
        end: { dateTime: end_time },
      };
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
        return `创建日程失败: HTTP ${resp.status} ${errText}`;
      }

      const data = (await resp.json()) as { id?: string; summary?: string };
      return `日程创建成功\n标题: ${data.summary ?? summary}\n日程ID: ${data.id ?? "未知"}`;
    } catch (err: any) {
      return `创建日程失败: ${err.message}`;
    }
  });

  // 查忙闲
  handlers.set("get_free_busy", async (ctx) => {
    const { user_ids, start_time, end_time } = ctx.args;
    try {
      const token = await client.getAccessToken();
      const userIdList = (user_ids as string).split(",").map((s) => s.trim());

      // 查忙闲使用 querySchedule 接口
      const userId = userIdList[0]; // 以第一个用户作为操作者
      const url = `https://api.dingtalk.com/v1.0/calendar/users/${userId}/querySchedule`;

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-acs-dingtalk-access-token": token,
        },
        body: JSON.stringify({
          userIds: userIdList,
          timeMin: start_time,
          timeMax: end_time,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        return `查询忙闲失败: HTTP ${resp.status} ${errText}`;
      }

      const data = (await resp.json()) as {
        freeBusyResponse?: Record<
          string,
          { busy?: Array<{ startTime: string; endTime: string }> }
        >;
      };

      if (!data.freeBusyResponse) {
        return "未获取到忙闲信息";
      }

      const lines: string[] = [];
      for (const [uid, info] of Object.entries(data.freeBusyResponse)) {
        const busySlots = info.busy ?? [];
        if (busySlots.length === 0) {
          lines.push(`用户 ${uid}: 空闲`);
        } else {
          const slots = busySlots
            .map((s) => `  ${s.startTime} ~ ${s.endTime}`)
            .join("\n");
          lines.push(`用户 ${uid}: 忙碌\n${slots}`);
        }
      }

      return `忙闲查询结果:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `查询忙闲失败: ${err.message}`;
    }
  });

  return handlers;
}

export const calendarTools: ToolModule = {
  definitions,
  createHandlers,
};
