/**
 * 命令路由器
 * 管理命令处理器的注册和分发
 */

/** 命令处理器函数类型 */
export type CommandHandler = (event: any) => Promise<void> | void;

/**
 * 路由器类
 * 从钉钉事件中提取命令名称，查找并执行对应的处理器
 */
export class Router {
  /** 命令名称 → 处理器映射 */
  private handlers = new Map<string, CommandHandler>();

  /**
   * 注册命令处理器
   * @param command - 命令名称（不含 "/" 前缀）
   * @param handler - 处理函数
   */
  register(command: string, handler: CommandHandler): void {
    this.handlers.set(command, handler);
  }

  /**
   * 处理命令事件
   * 从 event.event.data 中提取 command 或 name 字段，去掉 "/" 前缀后查找处理器执行
   *
   * @param event - 钉钉事件对象
   * @returns 如果找到匹配的处理器则返回 true，否则返回 false
   */
  async handleCommand(event: any): Promise<boolean> {
    const data = event?.event?.data;
    if (!data) return false;

    // 优先使用 command 字段，回退到 name 字段
    const raw: string | undefined = data.command ?? data.name;
    if (!raw) return false;

    // 去掉 "/" 前缀
    const command = raw.startsWith("/") ? raw.slice(1) : raw;

    const handler = this.handlers.get(command);
    if (!handler) return false;

    await handler(event);
    return true;
  }

  /** 获取已注册的命令列表 */
  getRegisteredCommands(): string[] {
    return Array.from(this.handlers.keys());
  }
}
