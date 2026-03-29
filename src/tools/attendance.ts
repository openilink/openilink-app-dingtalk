/**
 * 考勤工具模块
 * 提供查看考勤记录、查看假期状态等 2 个工具
 */

import type { DingtalkClient } from "../dingtalk/client.js";
import type { ToolModule, ToolDefinition, ToolHandler } from "./types.js";

/** 默认请求超时时间（毫秒） */
const REQUEST_TIMEOUT = 30_000;

/** 工具定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: "get_attendance_records",
    description: "查看指定员工在时间段内的考勤打卡记录",
    command: "get_attendance_records",
    parameters: {
      type: "object",
      properties: {
        user_ids: {
          type: "string",
          description: "员工 userId 列表，逗号分隔",
        },
        start_time: {
          type: "string",
          description: "起始时间，ISO 8601 格式（如 2024-01-01T00:00:00Z）",
        },
        end_time: {
          type: "string",
          description: "结束时间，ISO 8601 格式（如 2024-01-31T23:59:59Z）",
        },
      },
      required: ["user_ids", "start_time", "end_time"],
    },
  },
  {
    name: "get_leave_status",
    description: "查看指定员工在时间段内的请假状态",
    command: "get_leave_status",
    parameters: {
      type: "object",
      properties: {
        user_ids: {
          type: "string",
          description: "员工 userId 列表，逗号分隔",
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
 * 创建考勤工具的处理函数映射
 */
function createHandlers(client: DingtalkClient): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 查看考勤记录
  handlers.set("get_attendance_records", async (ctx) => {
    const { user_ids, start_time, end_time } = ctx.args;
    try {
      const token = await client.getAccessToken();
      const userIdList = (user_ids as string).split(",").map((s) => s.trim());
      const url = `https://oapi.dingtalk.com/attendance/list?access_token=${token}`;

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workDateFrom: start_time,
          workDateTo: end_time,
          userIdList,
          offset: 0,
          limit: 50,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      const data = (await resp.json()) as {
        errcode: number;
        errmsg: string;
        recordresult?: Array<{
          userId: string;
          userCheckTime: string;
          checkType: string;
          timeResult: string;
          locationResult: string;
          workDate: string;
        }>;
      };

      if (data.errcode !== 0) {
        return `获取考勤记录失败: ${data.errmsg}（错误码 ${data.errcode}）`;
      }

      const records = data.recordresult ?? [];
      if (records.length === 0) {
        return "该时间段内暂无考勤记录";
      }

      // 按用户分组展示
      const groupByUser = new Map<string, typeof records>();
      for (const r of records) {
        const list = groupByUser.get(r.userId) ?? [];
        list.push(r);
        groupByUser.set(r.userId, list);
      }

      const checkTypeMap: Record<string, string> = {
        OnDuty: "上班",
        OffDuty: "下班",
      };

      const timeResultMap: Record<string, string> = {
        Normal: "正常",
        Early: "早退",
        Late: "迟到",
        SeriousLate: "严重迟到",
        Absenteeism: "旷工",
        NotSigned: "未打卡",
      };

      const lines: string[] = [];
      for (const [userId, userRecords] of groupByUser) {
        lines.push(`\n员工 ${userId}:`);
        for (const r of userRecords) {
          const type = checkTypeMap[r.checkType] ?? r.checkType;
          const result = timeResultMap[r.timeResult] ?? r.timeResult;
          lines.push(`  ${r.userCheckTime} ${type} - ${result}`);
        }
      }

      return `考勤记录共 ${records.length} 条:${lines.join("\n")}`;
    } catch (err: any) {
      return `获取考勤记录失败: ${err.message}`;
    }
  });

  // 查看假期状态
  handlers.set("get_leave_status", async (ctx) => {
    const { user_ids, start_time, end_time } = ctx.args;
    try {
      const token = await client.getAccessToken();
      const userIdList = (user_ids as string).split(",").map((s) => s.trim());
      // TODO: 确认请假状态 API 路径，当前使用考勤请假接口
      const url = `https://oapi.dingtalk.com/topapi/attendance/getleavestatus?access_token=${token}`;

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userid_list: userIdList.join(","),
          start_time: new Date(start_time).getTime(),
          end_time: new Date(end_time).getTime(),
          offset: 0,
          size: 20,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      const data = (await resp.json()) as {
        errcode: number;
        errmsg: string;
        result?: {
          leave_status?: Array<{
            userid: string;
            start_time: number;
            end_time: number;
            duration_unit: string;
            duration_percent: number;
            status?: number;
          }>;
          has_more?: boolean;
        };
      };

      if (data.errcode !== 0) {
        return `获取假期状态失败: ${data.errmsg}（错误码 ${data.errcode}）`;
      }

      const leaveList = data.result?.leave_status ?? [];
      if (leaveList.length === 0) {
        return "该时间段内暂无请假记录";
      }

      const statusMap: Record<number, string> = {
        1: "审批中",
        2: "已同意",
        3: "已拒绝",
        4: "已撤销",
      };

      const lines = leaveList.map((l, i) => {
        const start = new Date(l.start_time).toLocaleString("zh-CN");
        const end = new Date(l.end_time).toLocaleString("zh-CN");
        const status = l.status !== undefined ? statusMap[l.status] ?? `状态${l.status}` : "未知";
        return `${i + 1}. 员工 ${l.userid}\n   时间: ${start} ~ ${end}\n   时长比例: ${l.duration_percent}${l.duration_unit}\n   状态: ${status}`;
      });

      return `请假记录共 ${leaveList.length} 条:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `获取假期状态失败: ${err.message}`;
    }
  });

  return handlers;
}

export const attendanceTools: ToolModule = {
  definitions,
  createHandlers,
};
