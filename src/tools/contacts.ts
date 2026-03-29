/**
 * 通讯录工具模块
 * 提供搜索用户、获取用户详情、列出部门成员等 3 个工具
 */

import type { DingtalkClient } from "../dingtalk/client.js";
import type { ToolModule, ToolDefinition, ToolHandler } from "./types.js";

/** 默认请求超时时间（毫秒） */
const REQUEST_TIMEOUT = 30_000;

/** 工具定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: "search_user",
    description: "通过手机号搜索钉钉用户",
    command: "search_user",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "手机号" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_user_info",
    description: "获取指定用户的详细信息",
    command: "get_user_info",
    parameters: {
      type: "object",
      properties: {
        user_id: { type: "string", description: "员工的 userId" },
      },
      required: ["user_id"],
    },
  },
  {
    name: "list_department_users",
    description: "列出指定部门下的所有成员 userId",
    command: "list_department_users",
    parameters: {
      type: "object",
      properties: {
        department_id: {
          type: "string",
          description: "部门ID，默认 \"1\" 表示根部门",
        },
      },
    },
  },
];

/**
 * 创建通讯录工具的处理函数映射
 */
function createHandlers(client: DingtalkClient): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 通过手机号搜索用户
  handlers.set("search_user", async (ctx) => {
    const { query } = ctx.args;
    try {
      const token = await client.getAccessToken();
      const url = `https://oapi.dingtalk.com/topapi/v2/user/getbymobile?access_token=${token}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: query }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      const data = (await resp.json()) as {
        errcode: number;
        errmsg: string;
        result?: { userid: string };
      };

      if (data.errcode !== 0) {
        return `搜索用户失败: ${data.errmsg}（错误码 ${data.errcode}）`;
      }

      if (!data.result?.userid) {
        return `未找到手机号为「${query}」的用户`;
      }

      return `找到用户，userId: ${data.result.userid}`;
    } catch (err: any) {
      return `搜索用户失败: ${err.message}`;
    }
  });

  // 获取用户详情
  handlers.set("get_user_info", async (ctx) => {
    const { user_id } = ctx.args;
    try {
      const token = await client.getAccessToken();
      const url = `https://oapi.dingtalk.com/topapi/v2/user/get?access_token=${token}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userid: user_id }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      const data = (await resp.json()) as {
        errcode: number;
        errmsg: string;
        result?: {
          userid: string;
          name: string;
          title?: string;
          mobile?: string;
          email?: string;
          dept_id_list?: number[];
          union_id?: string;
          avatar?: string;
          job_number?: string;
        };
      };

      if (data.errcode !== 0) {
        return `获取用户信息失败: ${data.errmsg}（错误码 ${data.errcode}）`;
      }

      const u = data.result!;
      const lines = [
        `姓名: ${u.name}`,
        `用户ID: ${u.userid}`,
        u.title ? `职位: ${u.title}` : null,
        u.mobile ? `手机: ${u.mobile}` : null,
        u.email ? `邮箱: ${u.email}` : null,
        u.job_number ? `工号: ${u.job_number}` : null,
        u.dept_id_list ? `所属部门ID: ${u.dept_id_list.join(", ")}` : null,
        u.union_id ? `unionId: ${u.union_id}` : null,
      ].filter(Boolean);

      return `用户详情:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `获取用户信息失败: ${err.message}`;
    }
  });

  // 列出部门成员
  handlers.set("list_department_users", async (ctx) => {
    const departmentId = ctx.args.department_id ?? "1";
    try {
      const token = await client.getAccessToken();
      const url = `https://oapi.dingtalk.com/topapi/user/listid?access_token=${token}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dept_id: Number(departmentId) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      const data = (await resp.json()) as {
        errcode: number;
        errmsg: string;
        result?: { userid_list: string[] };
      };

      if (data.errcode !== 0) {
        return `获取部门成员失败: ${data.errmsg}（错误码 ${data.errcode}）`;
      }

      const userIds = data.result?.userid_list ?? [];
      if (userIds.length === 0) {
        return `部门 ${departmentId} 下暂无成员`;
      }

      return `部门 ${departmentId} 共有 ${userIds.length} 名成员:\n${userIds.join("\n")}`;
    } catch (err: any) {
      return `获取部门成员失败: ${err.message}`;
    }
  });

  return handlers;
}

export const contactsTools: ToolModule = {
  definitions,
  createHandlers,
};
