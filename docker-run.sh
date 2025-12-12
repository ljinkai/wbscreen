#!/bin/bash

# Docker 运行脚本

set -e

IMAGE_NAME="wbscreen"
IMAGE_TAG="${1:-latest}"
CONTAINER_NAME="wbscreen"
PORT="${PORT:-3000}"

echo "=========================================="
echo "运行 Docker 容器: ${CONTAINER_NAME}"
echo "=========================================="
echo ""

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "错误: 未找到 Docker，请先安装 Docker"
    exit 1
fi

# 检查容器是否已存在
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "容器 ${CONTAINER_NAME} 已存在，正在停止并删除..."
    docker stop ${CONTAINER_NAME} 2>/dev/null || true
    docker rm ${CONTAINER_NAME} 2>/dev/null || true
fi

# 检查镜像是否存在
if ! docker images --format '{{.Repository}}:{{.Tag}}' | grep -q "^${IMAGE_NAME}:${IMAGE_TAG}$"; then
    echo "镜像 ${IMAGE_NAME}:${IMAGE_TAG} 不存在，正在构建..."
    ./docker-build.sh ${IMAGE_TAG}
fi

# 检查 .env 文件
if [ ! -f .env ]; then
    echo "警告: .env 文件不存在，将使用默认配置"
    echo "建议创建 .env 文件并配置七牛云参数"
fi

# 运行容器
echo "启动容器..."
docker run -d \
    --name ${CONTAINER_NAME} \
    -p ${PORT}:3000 \
    --env-file .env 2>/dev/null || \
docker run -d \
    --name ${CONTAINER_NAME} \
    -p ${PORT}:3000 \
    -e PORT=3000 \
    ${IMAGE_NAME}:${IMAGE_TAG}

echo ""
echo "=========================================="
echo "容器已启动！"
echo "=========================================="
echo ""
echo "查看日志:"
echo "  docker logs -f ${CONTAINER_NAME}"
echo ""
echo "停止容器:"
echo "  docker stop ${CONTAINER_NAME}"
echo ""
echo "删除容器:"
echo "  docker rm ${CONTAINER_NAME}"
echo ""
echo "测试服务:"
echo "  curl http://localhost:${PORT}/api/health"
echo ""

