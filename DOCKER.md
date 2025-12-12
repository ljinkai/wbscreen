# Docker 部署指南

本文档说明如何使用 Docker 部署网页截图服务。

## 快速开始

### 方式一：使用 Dockerfile

1. **构建镜像**

```bash
docker build -t wbscreen:latest .
```

2. **运行容器**

```bash
docker run -d \
  --name wbscreen \
  -p 3000:3000 \
  --env-file .env \
  wbscreen:latest
```

或者直接指定环境变量：

```bash
docker run -d \
  --name wbscreen \
  -p 3000:3000 \
  -e PORT=3000 \
  -e QINIU_ACCESS_KEY=your_access_key \
  -e QINIU_SECRET_KEY=your_secret_key \
  -e QINIU_BUCKET=static \
  -e QINIU_AUTO_UPLOAD=true \
  wbscreen:latest
```

### 方式二：使用 Docker Compose（推荐）

1. **创建 `.env` 文件**

在项目根目录创建 `.env` 文件，配置环境变量：

```bash
PORT=3000
PUPPETEER_HEADLESS=true
QINIU_ACCESS_KEY=your_access_key
QINIU_SECRET_KEY=your_secret_key
QINIU_BUCKET=static
QINIU_DOMAIN=https://cdn.example.com
QINIU_ZONE=Zone_z0
QINIU_AUTO_UPLOAD=true
```

2. **启动服务**

```bash
# Docker Compose v2（推荐，新版本 Docker Desktop）
docker compose up -d

# 或者旧版本的 docker-compose（如果已安装）
docker-compose up -d
```

3. **查看日志**

```bash
# Docker Compose v2
docker compose logs -f

# 或旧版本
docker-compose logs -f
```

4. **停止服务**

```bash
# Docker Compose v2
docker compose down

# 或旧版本
docker-compose down
```

## 环境变量配置

### 必需的环境变量

- `QINIU_ACCESS_KEY`: 七牛云 Access Key
- `QINIU_SECRET_KEY`: 七牛云 Secret Key
- `QINIU_BUCKET`: 七牛云存储空间名称

### 可选的环境变量

- `PORT`: 服务端口（默认 3000）
- `PUPPETEER_HEADLESS`: 是否无头模式（默认 true）
- `PUPPETEER_ARGS`: Puppeteer 启动参数
- `MAX_CONCURRENT_REQUESTS`: 最大并发请求数（默认 5）
- `BROWSER_POOL_SIZE`: 浏览器池大小（默认 3）
- `REQUEST_TIMEOUT`: 请求超时时间（默认 30000）
- `QINIU_DOMAIN`: 七牛云自定义域名
- `QINIU_ZONE`: 七牛云存储区域（默认 Zone_z0）
- `QINIU_AUTO_UPLOAD`: 是否自动上传（默认 true）

## 测试 Docker 部署

```bash
# 测试健康检查
curl http://localhost:3000/api/health

# 测试截图接口
curl -X POST http://localhost:3000/api/screenshot \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

## 生产环境建议

### 1. 资源限制

在 `docker-compose.yml` 中已经配置了资源限制，可以根据实际情况调整：

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
    reservations:
      cpus: '0.5'
      memory: 512M
```

### 2. 使用外部网络

```bash
docker network create wbscreen-network
docker run -d \
  --name wbscreen \
  --network wbscreen-network \
  -p 3000:3000 \
  --env-file .env \
  wbscreen:latest
```

### 3. 数据持久化

如果需要保存日志或其他数据，可以挂载卷：

```bash
docker run -d \
  --name wbscreen \
  -p 3000:3000 \
  -v $(pwd)/logs:/app/logs \
  --env-file .env \
  wbscreen:latest
```

### 4. 使用反向代理

建议使用 Nginx 作为反向代理：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## 故障排查

### 查看容器日志

```bash
docker logs wbscreen
# 或实时查看
docker logs -f wbscreen
```

### 进入容器调试

```bash
docker exec -it wbscreen /bin/bash
```

### 检查健康状态

```bash
docker ps
# 查看容器状态
docker inspect wbscreen
```

### 常见问题

1. **端口被占用**
   - 修改 `docker-compose.yml` 中的端口映射
   - 或使用 `-p 其他端口:3000` 运行容器

2. **内存不足**
   - 增加 Docker 的内存限制
   - 减少 `BROWSER_POOL_SIZE` 和 `MAX_CONCURRENT_REQUESTS`

3. **七牛云上传失败**
   - 检查环境变量是否正确
   - 检查网络连接
   - 查看容器日志获取详细错误信息

## 镜像优化

当前 Dockerfile 已经进行了优化：

- 使用多阶段构建（可选，当前未使用）
- 使用 `.dockerignore` 减少构建上下文
- 只安装生产依赖
- 使用非 root 用户运行
- 清理 apt 缓存

如需进一步优化，可以考虑：

1. 使用多阶段构建减少镜像大小
2. 使用 Alpine Linux 基础镜像（但需要额外配置 Chromium）
3. 使用 BuildKit 加速构建

