/**
 * 待办工具测试
 * 验证 create_todo、list_todos、update_todo
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

/** 模拟待办存储 */
let todoStore: any[] = [];

/** 模拟待办工具 */
function createTodoTools() {
  const createTodo = vi.fn(
    async (params: { subject: string; description?: string; dueDate?: string; executorIds?: string[] }) => {
      const todo = {
        id: `todo-${Date.now()}`,
        subject: params.subject,
        description: params.description ?? "",
        dueDate: params.dueDate ?? null,
        executorIds: params.executorIds ?? [],
        done: false,
        createdAt: new Date().toISOString(),
      };
      todoStore.push(todo);
      return { ok: true, todo };
    }
  );

  const listTodos = vi.fn(async (params: { userId?: string; done?: boolean }) => {
    let result = [...todoStore];
    if (params.done !== undefined) {
      result = result.filter((t) => t.done === params.done);
    }
    return { todos: result, total: result.length };
  });

  const updateTodo = vi.fn(async (params: { todoId: string; done?: boolean; subject?: string }) => {
    const todo = todoStore.find((t) => t.id === params.todoId);
    if (!todo) return { ok: false, error: "待办不存在" };
    if (params.done !== undefined) todo.done = params.done;
    if (params.subject !== undefined) todo.subject = params.subject;
    return { ok: true, todo };
  });

  return [
    { name: "create_todo", description: "创建待办任务", handler: createTodo },
    { name: "list_todos", description: "获取待办列表", handler: listTodos },
    { name: "update_todo", description: "更新待办状态", handler: updateTodo },
  ];
}

describe("Todo Tools", () => {
  let tools: ReturnType<typeof createTodoTools>;

  beforeEach(() => {
    todoStore = [];
    tools = createTodoTools();
  });

  it("应当注册 3 个待办工具", () => {
    expect(tools).toHaveLength(3);
  });

  describe("create_todo", () => {
    it("应当创建待办并返回结果", async () => {
      const tool = tools.find((t) => t.name === "create_todo")!;
      const result = await tool.handler({
        subject: "完成项目报告",
        description: "Q4 季度总结",
        dueDate: "2026-04-01",
      });

      expect(result.ok).toBe(true);
      expect(result.todo).toBeDefined();
      expect(result.todo.subject).toBe("完成项目报告");
      expect(result.todo.description).toBe("Q4 季度总结");
      expect(result.todo.done).toBe(false);
    });

    it("应当支持不设置截止时间", async () => {
      const tool = tools.find((t) => t.name === "create_todo")!;
      const result = await tool.handler({ subject: "无期限任务" });

      expect(result.ok).toBe(true);
      expect(result.todo.dueDate).toBeNull();
    });

    it("应当支持指定执行人", async () => {
      const tool = tools.find((t) => t.name === "create_todo")!;
      const result = await tool.handler({
        subject: "多人任务",
        executorIds: ["user-001", "user-002"],
      });

      expect(result.todo.executorIds).toEqual(["user-001", "user-002"]);
    });
  });

  describe("list_todos", () => {
    it("应当返回所有待办", async () => {
      const createTool = tools.find((t) => t.name === "create_todo")!;
      await createTool.handler({ subject: "任务A" });
      await createTool.handler({ subject: "任务B" });

      const listTool = tools.find((t) => t.name === "list_todos")!;
      const result = await listTool.handler({});

      expect(result.total).toBe(2);
      expect(result.todos).toHaveLength(2);
    });

    it("应当按完成状态过滤", async () => {
      const createTool = tools.find((t) => t.name === "create_todo")!;
      await createTool.handler({ subject: "任务A" });
      await createTool.handler({ subject: "任务B" });
      // 手动标记一个为完成
      todoStore[0].done = true;

      const listTool = tools.find((t) => t.name === "list_todos")!;

      const undone = await listTool.handler({ done: false });
      expect(undone.total).toBe(1);
      expect(undone.todos[0].subject).toBe("任务B");

      const done = await listTool.handler({ done: true });
      expect(done.total).toBe(1);
      expect(done.todos[0].subject).toBe("任务A");
    });

    it("无待办时应返回空列表", async () => {
      const listTool = tools.find((t) => t.name === "list_todos")!;
      const result = await listTool.handler({});

      expect(result.total).toBe(0);
      expect(result.todos).toEqual([]);
    });
  });

  describe("update_todo", () => {
    it("应当更新待办完成状态", async () => {
      const createTool = tools.find((t) => t.name === "create_todo")!;
      const { todo } = await createTool.handler({ subject: "测试任务" });

      const updateTool = tools.find((t) => t.name === "update_todo")!;
      const result = await updateTool.handler({ todoId: todo.id, done: true });

      expect(result.ok).toBe(true);
      expect(result.todo.done).toBe(true);
    });

    it("应当更新待办标题", async () => {
      const createTool = tools.find((t) => t.name === "create_todo")!;
      const { todo } = await createTool.handler({ subject: "旧标题" });

      const updateTool = tools.find((t) => t.name === "update_todo")!;
      const result = await updateTool.handler({ todoId: todo.id, subject: "新标题" });

      expect(result.ok).toBe(true);
      expect(result.todo.subject).toBe("新标题");
    });

    it("待办不存在时应返回错误", async () => {
      const updateTool = tools.find((t) => t.name === "update_todo")!;
      const result = await updateTool.handler({ todoId: "non-existent", done: true });

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("工具元信息", () => {
    it("每个工具应有名称和描述", () => {
      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
      }
    });
  });
});
