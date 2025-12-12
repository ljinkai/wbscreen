#!/bin/bash

# 网页截图服务 API 测试脚本
# 默认服务地址
BASE_URL="http://localhost:3000"

echo "=========================================="
echo "网页截图服务 API 测试"
echo "=========================================="
echo ""

# 1. 基本截图测试（返回二进制图片）
echo "1. 基本截图测试（保存为 screenshot.png）"
echo "----------------------------------------"
curl -X POST ${BASE_URL}/api/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com"
  }' \
  --output screenshot.png \
  -w "\nHTTP状态码: %{http_code}\n"
echo ""

# 2. 返回 Base64 编码
echo "2. 返回 Base64 编码"
echo "----------------------------------------"
curl -X POST ${BASE_URL}/api/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "returnBase64": true
  }' | jq '.'
echo ""

# 3. 整页截图
echo "3. 整页截图（保存为 fullpage.png）"
echo "----------------------------------------"
curl -X POST ${BASE_URL}/api/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "fullPage": true
  }' \
  --output fullpage.png \
  -w "\nHTTP状态码: %{http_code}\n"
echo ""

# 4. 移动端视口
echo "4. 移动端视口截图（保存为 mobile.png）"
echo "----------------------------------------"
curl -X POST ${BASE_URL}/api/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "width": 375,
    "height": 667
  }' \
  --output mobile.png \
  -w "\nHTTP状态码: %{http_code}\n"
echo ""

# 5. JPEG 格式
echo "5. JPEG 格式截图（保存为 screenshot.jpg）"
echo "----------------------------------------"
curl -X POST ${BASE_URL}/api/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "format": "jpeg",
    "quality": 85
  }' \
  --output screenshot.jpg \
  -w "\nHTTP状态码: %{http_code}\n"
echo ""

# 6. 健康检查
echo "6. 健康检查"
echo "----------------------------------------"
curl -X GET ${BASE_URL}/api/health | jq '.'
echo ""

# 7. 如果配置了七牛云，测试自动上传
echo "7. 测试七牛云自动上传（如果已配置）"
echo "----------------------------------------"
curl -X POST ${BASE_URL}/api/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com"
  }' | jq '.'
echo ""

echo "=========================================="
echo "测试完成"
echo "=========================================="

