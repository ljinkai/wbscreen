#!/bin/bash

# Docker Compose 启动脚本

echo "=========================================="
echo "使用 Docker Compose 启动服务"
echo "=========================================="
echo ""

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "错误: 未找到 Docker，请先安装 Docker"
    exit 1
fi

# 检查 .env 文件
if [ ! -f .env ]; then
    echo "警告: .env 文件不存在"
    echo "建议创建 .env 文件并配置七牛云参数"
    read -p "是否继续？(y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 尝试使用 docker compose (v2)
if docker compose version &> /dev/null; then
    echo "使用 Docker Compose v2..."
    docker compose up -d
elif command -v docker-compose &> /dev/null; then
    echo "使用 docker-compose (v1)..."
    docker-compose up -d
else
    echo "错误: 未找到 Docker Compose"
    echo "请安装 Docker Compose 或使用 Docker Desktop"
    exit 1
fi

echo ""
echo "=========================================="
echo "服务已启动！"
echo "=========================================="
echo ""
echo "查看日志:"
echo "  docker compose logs -f"
echo ""
echo "停止服务:"
echo "  docker compose down"
echo ""
echo "测试服务:"
echo "  curl http://localhost:3000/api/health"
echo ""
