/**
 * 钉盘工具模块
 * 提供列出钉盘空间、列出空间文件等 2 个工具
 */

import type { DingtalkClient } from "../dingtalk/client.js";
import type { ToolModule, ToolDefinition, ToolHandler } from "./types.js";

/** 默认请求超时时间（毫秒） */
const REQUEST_TIMEOUT = 30_000;

/** 工具定义列表 */
const definitions: ToolDefinition[] = [
  {
    name: "list_spaces",
    description: "列出当前用户的钉盘空间列表",
    command: "list_spaces",
    parameters: {
      type: "object",
      properties: {
        count: {
          type: "number",
          description: "返回的空间数量，默认 20",
        },
      },
    },
  },
  {
    name: "list_files",
    description: "列出指定钉盘空间中的文件",
    command: "list_files",
    parameters: {
      type: "object",
      properties: {
        space_id: { type: "string", description: "钉盘空间ID" },
        parent_id: {
          type: "string",
          description: "父文件夹ID，不传则列出根目录",
        },
      },
      required: ["space_id"],
    },
  },
];

/**
 * 创建钉盘工具的处理函数映射
 */
function createHandlers(client: DingtalkClient): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 列出钉盘空间
  handlers.set("list_spaces", async (ctx) => {
    const count = ctx.args.count ?? 20;
    try {
      const token = await client.getAccessToken();
      // TODO: 需要当前用户的 unionId，此处使用 ctx.userId 作为 fallback
      const unionId = ctx.userId;
      const params = new URLSearchParams();
      params.set("maxResults", String(count));

      const url = `https://api.dingtalk.com/v1.0/drive/users/${unionId}/spaces?${params}`;
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          "x-acs-dingtalk-access-token": token,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        return `获取钉盘空间失败: HTTP ${resp.status} ${errText}`;
      }

      const data = (await resp.json()) as {
        spaces?: Array<{
          spaceId: string;
          spaceName: string;
          spaceType: string;
          quota?: number;
          usedQuota?: number;
        }>;
      };

      const spaces = data.spaces ?? [];
      if (spaces.length === 0) {
        return "暂无可用的钉盘空间";
      }

      const lines = spaces.map((s, i) => {
        const quotaStr =
          s.quota !== undefined && s.usedQuota !== undefined
            ? ` (已用 ${formatBytes(s.usedQuota)} / 共 ${formatBytes(s.quota)})`
            : "";
        return `${i + 1}. ${s.spaceName}\n   空间ID: ${s.spaceId}\n   类型: ${s.spaceType}${quotaStr}`;
      });

      return `共找到 ${spaces.length} 个钉盘空间:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `获取钉盘空间失败: ${err.message}`;
    }
  });

  // 列出空间文件
  handlers.set("list_files", async (ctx) => {
    const { space_id, parent_id } = ctx.args;
    try {
      const token = await client.getAccessToken();
      const params = new URLSearchParams();
      params.set("maxResults", "50");
      if (parent_id) {
        params.set("parentId", parent_id);
      }

      const url = `https://api.dingtalk.com/v1.0/drive/spaces/${space_id}/files?${params}`;
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          "x-acs-dingtalk-access-token": token,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        return `获取文件列表失败: HTTP ${resp.status} ${errText}`;
      }

      const data = (await resp.json()) as {
        files?: Array<{
          fileId: string;
          fileName: string;
          fileType: string;
          fileSize?: number;
          createdTime?: string;
          modifiedTime?: string;
        }>;
      };

      const files = data.files ?? [];
      if (files.length === 0) {
        return "该目录下暂无文件";
      }

      const lines = files.map((f, i) => {
        const typeStr = f.fileType === "folder" ? "📁 文件夹" : "📄 文件";
        const sizeStr =
          f.fileSize !== undefined && f.fileType !== "folder"
            ? ` (${formatBytes(f.fileSize)})`
            : "";
        const timeStr = f.modifiedTime
          ? `\n   修改时间: ${f.modifiedTime}`
          : "";
        return `${i + 1}. ${typeStr} ${f.fileName}${sizeStr}\n   文件ID: ${f.fileId}${timeStr}`;
      });

      return `共找到 ${files.length} 个文件/文件夹:\n${lines.join("\n")}`;
    } catch (err: any) {
      return `获取文件列表失败: ${err.message}`;
    }
  });

  return handlers;
}

/**
 * 格式化字节数为可读字符串
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export const driveTools: ToolModule = {
  definitions,
  createHandlers,
};
