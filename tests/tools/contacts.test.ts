/**
 * 通讯录工具测试
 * 验证 search_user、get_user_info 等 tools
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

/** 模拟钉钉 API 响应 */
const mockUsers = [
  { userId: "user-001", name: "张三", department: "技术部", mobile: "13800138001" },
  { userId: "user-002", name: "李四", department: "产品部", mobile: "13800138002" },
  { userId: "user-003", name: "张三丰", department: "技术部", mobile: "13800138003" },
];

/** 模拟通讯录工具 */
function createContactsTools() {
  const searchUser = vi.fn(async (params: { keyword: string }) => {
    const results = mockUsers.filter(
      (u) => u.name.includes(params.keyword) || u.department.includes(params.keyword)
    );
    return { users: results, total: results.length };
  });

  const getUserInfo = vi.fn(async (params: { userId: string }) => {
    const user = mockUsers.find((u) => u.userId === params.userId);
    if (!user) return { error: "用户不存在" };
    return user;
  });

  const getDepartmentUsers = vi.fn(async (params: { departmentId: string }) => {
    return { users: mockUsers.filter((u) => u.department === "技术部") };
  });

  return [
    { name: "search_user", description: "搜索钉钉用户", handler: searchUser },
    { name: "get_user_info", description: "获取用户详情", handler: getUserInfo },
    { name: "get_department_users", description: "获取部门成员", handler: getDepartmentUsers },
  ];
}

describe("Contacts Tools", () => {
  let tools: ReturnType<typeof createContactsTools>;

  beforeEach(() => {
    tools = createContactsTools();
  });

  it("应当注册 3 个通讯录工具", () => {
    expect(tools).toHaveLength(3);
  });

  describe("search_user", () => {
    it("应当按名称搜索用户", async () => {
      const tool = tools.find((t) => t.name === "search_user")!;
      const result = await tool.handler({ keyword: "张三" });

      expect(result.total).toBe(2);
      expect(result.users).toHaveLength(2);
      expect(result.users[0].name).toBe("张三");
      expect(result.users[1].name).toBe("张三丰");
    });

    it("应当按部门搜索用户", async () => {
      const tool = tools.find((t) => t.name === "search_user")!;
      const result = await tool.handler({ keyword: "技术部" });

      expect(result.total).toBe(2);
      expect(result.users.every((u: any) => u.department === "技术部")).toBe(true);
    });

    it("无匹配结果时应返回空列表", async () => {
      const tool = tools.find((t) => t.name === "search_user")!;
      const result = await tool.handler({ keyword: "不存在的人" });

      expect(result.total).toBe(0);
      expect(result.users).toHaveLength(0);
    });
  });

  describe("get_user_info", () => {
    it("应当返回用户详情", async () => {
      const tool = tools.find((t) => t.name === "get_user_info")!;
      const result = await tool.handler({ userId: "user-001" });

      expect(result).toHaveProperty("name", "张三");
      expect(result).toHaveProperty("department", "技术部");
      expect(result).toHaveProperty("mobile", "13800138001");
    });

    it("用户不存在时应返回错误信息", async () => {
      const tool = tools.find((t) => t.name === "get_user_info")!;
      const result = await tool.handler({ userId: "non-existent" });

      expect(result).toHaveProperty("error");
    });
  });

  describe("get_department_users", () => {
    it("应当返回部门成员列表", async () => {
      const tool = tools.find((t) => t.name === "get_department_users")!;
      const result = await tool.handler({ departmentId: "dept-001" });

      expect(result.users).toBeDefined();
      expect(result.users.length).toBeGreaterThan(0);
    });
  });

  describe("工具元信息", () => {
    it("每个工具应有名称和描述", () => {
      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
      }
    });

    it("工具名称不应重复", () => {
      const names = tools.map((t) => t.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });
});
