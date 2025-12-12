#!/bin/bash

# Docker 构建脚本

set -e

IMAGE_NAME="wbscreen"
IMAGE_TAG="${1:-latest}"

echo "=========================================="
echo "构建 Docker 镜像: ${IMAGE_NAME}:${IMAGE_TAG}"
echo "=========================================="
echo ""

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "错误: 未找到 Docker，请先安装 Docker"
    exit 1
fi

# 构建镜像
echo "开始构建镜像..."
if [ "$2" == "--no-cache" ]; then
    echo "使用 --no-cache 选项，清理构建缓存..."
    docker build --no-cache -t ${IMAGE_NAME}:${IMAGE_TAG} .
else
    docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .
fi

echo ""
echo "=========================================="
echo "构建完成！"
echo "=========================================="
echo ""
echo "运行容器:"
echo "  docker run -d --name wbscreen -p 3000:3000 --env-file .env ${IMAGE_NAME}:${IMAGE_TAG}"
echo ""
echo "或使用 docker-compose:"
echo "  docker-compose up -d"
echo ""

