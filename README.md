# Web Screenshot Service

基于 Node.js 的网页截图服务，通过 RESTful API 提供网页截图功能。

## 功能特性

- 🚀 基于 Puppeteer 的高性能截图
- 📱 支持自定义视口大小
- 🖼️ 支持 PNG 和 JPEG 格式
- 📄 支持整页截图
- ⚡ 浏览器实例池管理，提高并发性能
- 🔒 支持 URL 白名单，防止 SSRF 攻击
- 🛡️ 并发控制，避免资源耗尽
- ☁️ 支持自动上传到七牛云存储
- 📦 支持返回 Base64 编码

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动服务

```bash
# 开发模式（自动重启）
npm run dev

# 生产模式
npm start
```

服务默认运行在 `http://localhost:3000`

## API 文档

### 截图接口

**POST** `/api/screenshot`

#### 请求示例

```bash
curl -X POST http://localhost:3000/api/screenshot \
  -H "x-wb-c: 1024" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com"
  }' \
  --output screenshot.png
```

#### 请求参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| url | string | 是 | - | 目标网页 URL |
| width | number | 否 | 1920 | 视口宽度 |
| height | number | 否 | 1080 | 视口高度 |
| fullPage | boolean | 否 | false | 是否截取整页 |
| format | string | 否 | png | 图片格式 (png/jpeg) |
| quality | number | 否 | 90 | JPEG 质量 (0-100) |
| waitUntil | string | 否 | networkidle0 | 等待条件 |
| timeout | number | 否 | 30000 | 超时时间（毫秒） |
| returnBase64 | boolean | 否 | false | 是否返回 base64 编码的图片 |
| returnBinary | boolean | 否 | false | 是否返回二进制图片（默认返回 JSON） |

#### 响应

**默认模式**（配置了七牛云）：
- Content-Type: `application/json`
- Body: JSON 格式，包含七牛云访问 URL
```json
{
  "success": true,
  "format": "png",
  "url": "https://cdn.example.com/screenshots/1234567890_abc123.png",
  "key": "screenshots/1234567890_abc123.png",
  "hash": "Fh8xVqod2QW1PY..."
}
```

**Base64 模式**（`returnBase64: true`）：
- Content-Type: `application/json`
- Body: JSON 格式
```json
{
  "success": true,
  "format": "png",
  "base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
}
```

**二进制模式**（`returnBinary: true`）：
- Content-Type: `image/png` 或 `image/jpeg`
- Body: 图片二进制数据

**错误响应**：
```json
{
  "error": true,
  "message": "错误描述",
  "code": "ERROR_CODE"
}
```

### 健康检查接口

**GET** `/api/health`

#### 响应示例

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 使用示例

### 基本截图（默认返回七牛云 URL）

```bash
curl -X POST http://localhost:3000/api/screenshot \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

响应（如果配置了七牛云）：
```json
{
  "success": true,
  "format": "png",
  "url": "https://cdn.example.com/screenshots/1234567890_abc123.png",
  "key": "screenshots/1234567890_abc123.png",
  "hash": "Fh8xVqod2QW1PY..."
}
```

### 返回二进制图片

如果需要返回二进制图片而不是 JSON，使用 `returnBinary: true`：

```bash
curl -X POST http://localhost:3000/api/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "returnBinary": true
  }' \
  --output screenshot.png
```

### 截取整页

```bash
curl -X POST http://localhost:3000/api/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "fullPage": true
  }' \
  --output fullpage.png
```

### 移动端视口

```bash
curl -X POST http://localhost:3000/api/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "width": 375,
    "height": 667
  }' \
  --output mobile.png
```

### JPEG 格式

```bash
curl -X POST http://localhost:3000/api/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "format": "jpeg",
    "quality": 85
  }' \
  --output screenshot.jpg
```

### 返回 Base64 编码

```bash
curl -X POST http://localhost:3000/api/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "returnBase64": true
  }'
```

响应示例：
```json
{
  "success": true,
  "format": "png",
  "base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
}
```

### 自动上传到七牛云

如果配置了七牛云参数，截图会自动上传到七牛云，并返回七牛云的访问 URL：

```bash
curl -X POST http://localhost:3000/api/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com"
  }'
```

响应示例（已配置七牛云）：
```json
{
  "success": true,
  "format": "png",
  "url": "https://cdn.example.com/screenshots/1234567890_abc123.png",
  "key": "screenshots/1234567890_abc123.png",
  "hash": "Fh8xVqod2QW1PY..."
}
```

## 配置

通过环境变量进行配置，参考 `.env.example` 文件：

```bash
# 服务端口
PORT=3000

# 浏览器配置
PUPPETEER_HEADLESS=true
PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox

# 性能配置
MAX_CONCURRENT_REQUESTS=5
BROWSER_POOL_SIZE=3
REQUEST_TIMEOUT=30000

# 安全配置（可选）
ALLOWED_DOMAINS=example.com,www.example.com

# 七牛云配置（可选，配置后自动上传截图到七牛云）
QINIU_ACCESS_KEY=your_access_key
QINIU_SECRET_KEY=your_secret_key
QINIU_BUCKET=static
QINIU_DOMAIN=https://cdn.example.com
QINIU_ZONE=Zone_z0
QINIU_AUTO_UPLOAD=true
```

## Docker 部署

### 使用 Dockerfile 构建

```bash
# 构建镜像
docker build -t wbscreen:latest .

# 运行容器
docker run -d \
  --name wbscreen \
  -p 3000:3000 \
  -e QINIU_ACCESS_KEY=your_access_key \
  -e QINIU_SECRET_KEY=your_secret_key \
  -e QINIU_BUCKET=static \
  -e QINIU_AUTO_UPLOAD=true \
  wbscreen:latest
```

### 使用 Docker Compose

```bash
# 使用 docker-compose.yml 启动（Docker Compose v2）
docker compose up -d

# 或旧版本的 docker-compose
docker-compose up -d

# 查看日志
docker compose logs -f

# 停止服务
docker compose down
```

**注意**：使用 Docker Compose 时，环境变量可以从 `.env` 文件自动加载。

### Docker 镜像特点

- 基于 Node.js 22-slim 镜像
- 已安装 Puppeteer 所需的所有系统依赖
- 使用非 root 用户运行（安全最佳实践）
- 包含健康检查
- 优化的镜像大小

## 系统要求

- Node.js >= 22.0.0
- 系统内存 >= 2GB（推荐）
- 网络连接（用于访问目标网页）

### Docker 部署要求

- Docker >= 20.10
- Docker Compose >= 2.0（可选）

## 项目结构

```
wbscreen/
├── src/
│   ├── index.js              # 入口文件
│   ├── routes/
│   │   └── screenshot.js     # 截图路由
│   ├── services/
│   │   └── screenshotService.js  # 截图服务
│   ├── utils/
│   │   ├── validator.js      # 参数验证
│   │   └── errorHandler.js   # 错误处理
│   └── config/
│       └── default.js        # 默认配置
├── doc/
│   └── 技术实现说明.md
├── package.json
└── README.md
```

## 注意事项

1. **内存管理**: Puppeteer 会消耗大量内存，建议合理配置浏览器池大小
2. **网络环境**: 确保服务器能够访问目标网页
3. **反爬虫机制**: 某些网站可能有反爬虫机制，可能需要额外处理
4. **资源清理**: 服务会自动管理浏览器实例，无需手动清理
5. **并发控制**: 默认最大并发请求数为 5，可根据服务器性能调整

## 许可证

MIT

