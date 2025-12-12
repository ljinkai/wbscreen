#!/bin/bash

# Docker 重新启动脚本（支持重新构建）

set -e

IMAGE_NAME="wbscreen"
IMAGE_TAG="${1:-latest}"
REBUILD="${2:-}"

echo "=========================================="
echo "重新启动 Docker 服务"
echo "=========================================="
echo ""

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "错误: 未找到 Docker，请先安装 Docker"
    exit 1
fi

# 检查是否使用 Docker Compose
if docker compose version &> /dev/null 2>&1 || command -v docker-compose &> /dev/null; then
    echo "检测到 Docker Compose，使用 Compose 方式重启..."
    echo ""
    
    # 停止并删除旧容器
    echo "停止现有服务..."
    if docker compose version &> /dev/null; then
        docker compose down 2>/dev/null || true
    else
        docker-compose down 2>/dev/null || true
    fi
    
    # 如果需要重新构建
    if [ "$REBUILD" == "--rebuild" ] || [ "$REBUILD" == "-r" ]; then
        echo "重新构建镜像..."
        if docker compose version &> /dev/null; then
            docker compose build --no-cache
        else
            docker-compose build --no-cache
        fi
    fi
    
    # 启动服务
    echo "启动服务..."
    if docker compose version &> /dev/null; then
        docker compose up -d
    else
        docker-compose up -d
    fi
    
    echo ""
    echo "=========================================="
    echo "服务已重新启动！"
    echo "=========================================="
    echo ""
    echo "查看日志:"
    if docker compose version &> /dev/null; then
        echo "  docker compose logs -f"
        echo ""
        echo "查看状态:"
        echo "  docker compose ps"
    else
        echo "  docker-compose logs -f"
        echo ""
        echo "查看状态:"
        echo "  docker-compose ps"
    fi
    echo ""
    echo "测试服务:"
    echo "  curl http://localhost:3000/api/health"
    echo ""
    
else
    # 使用 docker run 方式
    echo "使用 Docker Run 方式重启..."
    echo ""
    
    CONTAINER_NAME="wbscreen"
    
    # 停止并删除旧容器
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo "停止并删除现有容器..."
        docker stop ${CONTAINER_NAME} 2>/dev/null || true
        docker rm ${CONTAINER_NAME} 2>/dev/null || true
    fi
    
    # 如果需要重新构建
    if [ "$REBUILD" == "--rebuild" ] || [ "$REBUILD" == "-r" ]; then
        echo "重新构建镜像..."
        ./docker-build.sh ${IMAGE_TAG} --no-cache
    fi
    
    # 检查镜像是否存在
    if ! docker images --format '{{.Repository}}:{{.Tag}}' | grep -q "^${IMAGE_NAME}:${IMAGE_TAG}$"; then
        echo "镜像不存在，正在构建..."
        ./docker-build.sh ${IMAGE_TAG}
    fi
    
    # 启动容器
    echo "启动容器..."
    PORT="${PORT:-3000}"
    if [ -f .env ]; then
        docker run -d \
            --name ${CONTAINER_NAME} \
            -p ${PORT}:3000 \
            --env-file .env \
            ${IMAGE_NAME}:${IMAGE_TAG}
    else
        docker run -d \
            --name ${CONTAINER_NAME} \
            -p ${PORT}:3000 \
            -e PORT=3000 \
            ${IMAGE_NAME}:${IMAGE_TAG}
    fi
    
    echo ""
    echo "=========================================="
    echo "容器已重新启动！"
    echo "=========================================="
    echo ""
    echo "查看日志:"
    echo "  docker logs -f ${CONTAINER_NAME}"
    echo ""
    echo "停止容器:"
    echo "  docker stop ${CONTAINER_NAME}"
    echo ""
    echo "测试服务:"
    echo "  curl http://localhost:${PORT}/api/health"
    echo ""
fi

