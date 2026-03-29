# 阶段一：构建
FROM node:20-alpine AS builder

WORKDIR /app

# 先复制依赖文件以利用缓存层
COPY package.json package-lock.json* ./

# 安装全部依赖（含 devDependencies，用于编译）
RUN npm install

# 复制源码
COPY tsconfig.json ./
COPY src/ ./src/

# 编译 TypeScript
RUN npm run build

# 阶段二：运行
FROM node:20-alpine

WORKDIR /app

# 仅复制生产依赖文件
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

# 从构建阶段复制编译产物
COPY --from=builder /app/dist ./dist

# 创建数据目录
RUN mkdir -p /data

# 默认环境变量
ENV NODE_ENV=production
ENV DB_PATH=/data/dingtalk.db
ENV PORT=8084

# 暴露端口
EXPOSE 8084

# 数据卷：持久化 SQLite 数据库
VOLUME ["/data"]

# 启动应用
CMD ["node", "dist/index.js"]
