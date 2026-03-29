/**
 * 审批流程工具模块
 * 提供查看审批列表、查看审批详情等 2 个工具
 */

import type { DingtalkClient } from "../dingtalk/client.js";
import type { ToolModule, ToolDefinition, ToolHandler } from "./types.js";

/** 默认请求超时时间（毫秒） */
const REQUEST_TIMEOUT = 30_000;

/** 工具定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: "list_approvals",
    description: "查看指定审批模板的审批实例ID列表",
    command: "list_approvals",
    parameters: {
      type: "object",
      properties: {
        process_code: {
          type: "string",
          description: "审批模板的唯一标识（process_code），必填",
        },
      },
      required: ["process_code"],
    },
  },
  {
    name: "get_approval_detail",
    description: "查看指定审批实例的详细信息",
    command: "get_approval_detail",
    parameters: {
      type: "object",
      properties: {
        process_instance_id: {
          type: "string",
          description: "审批实例ID",
        },
      },
      required: ["process_instance_id"],
    },
  },
];

/**
 * 创建审批工具的处理函数映射
 */
function createHandlers(client: DingtalkClient): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 查看审批列表
  handlers.set("list_approvals", async (ctx) => {
    const { process_code } = ctx.args;
    try {
      const token = await client.getAccessToken();
      const url = `https://oapi.dingtalk.com/topapi/processinstance/listids?access_token=${token}`;

      const body: Record<string, any> = {
        // 查最近 30 天的审批
        start_time: Date.now() - 30 * 24 * 60 * 60 * 1000,
        size: 20,
        cursor: 0,
      };
      if (process_code) {
        body.process_code = process_code;
      }

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      const data = (await resp.json()) as {
        errcode: number;
        errmsg: string;
        result?: {
          list: string[];
          next_cursor?: number;
        };
      };

      if (data.errcode !== 0) {
        return `获取审批列表失败: ${data.errmsg}（错误码 ${data.errcode}）`;
      }

      const ids = data.result?.list ?? [];
      if (ids.length === 0) {
        return "最近 30 天内暂无审批实例";
      }

      return `找到 ${ids.length} 条审批实例:\n${ids.map((id, i) => `${i + 1}. ${id}`).join("\n")}`;
    } catch (err: any) {
      return `获取审批列表失败: ${err.message}`;
    }
  });

  // 查看审批详情
  handlers.set("get_approval_detail", async (ctx) => {
    const { process_instance_id } = ctx.args;
    try {
      const token = await client.getAccessToken();
      const url = `https://oapi.dingtalk.com/topapi/processinstance/get?access_token=${token}`;

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ process_instance_id }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      const data = (await resp.json()) as {
        errcode: number;
        errmsg: string;
        process_instance?: {
          title: string;
          status: string;
          result: string;
          create_time: string;
          finish_time?: string;
          originator_userid: string;
          originator_dept_name?: string;
          form_component_values?: Array<{
            name: string;
            value: string;
          }>;
          operation_records?: Array<{
            userid: string;
            date: string;
            type: string;
            result: string;
            remark?: string;
          }>;
        };
      };

      if (data.errcode !== 0) {
        return `获取审批详情失败: ${data.errmsg}（错误码 ${data.errcode}）`;
      }

      const inst = data.process_instance;
      if (!inst) {
        return "未找到该审批实例";
      }

      const statusMap: Record<string, string> = {
        NEW: "新创建",
        RUNNING: "审批中",
        TERMINATED: "已撤销",
        COMPLETED: "已完成",
      };

      const resultMap: Record<string, string> = {
        agree: "同意",
        refuse: "拒绝",
        none: "无",
      };

      const lines = [
        `标题: ${inst.title}`,
        `状态: ${statusMap[inst.status] ?? inst.status}`,
        `结果: ${resultMap[inst.result] ?? inst.result}`,
        `发起人: ${inst.originator_userid}`,
        inst.originator_dept_name ? `发起部门: ${inst.originator_dept_name}` : null,
        `创建时间: ${inst.create_time}`,
        inst.finish_time ? `完成时间: ${inst.finish_time}` : null,
      ].filter(Boolean);

      // 表单字段
      if (inst.form_component_values?.length) {
        lines.push("\n表单内容:");
        for (const field of inst.form_component_values) {
          lines.push(`  ${field.name}: ${field.value}`);
        }
      }

      // 审批记录
      if (inst.operation_records?.length) {
        lines.push("\n审批记录:");
        for (const record of inst.operation_records) {
          const remarkStr = record.remark ? `（${record.remark}）` : "";
          lines.push(
            `  ${record.date} ${record.userid} ${record.type}=${record.result}${remarkStr}`
          );
        }
      }

      return `审批详情:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `获取审批详情失败: ${err.message}`;
    }
  });

  return handlers;
}

export const workflowTools: ToolModule = {
  definitions,
  createHandlers,
};
