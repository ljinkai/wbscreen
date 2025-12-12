#!/bin/bash

echo "测试截图接口（默认返回 JSON）"
echo "=================================="
echo ""

curl -X POST http://localhost:3000/api/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.vibary.art/en"
  }' | jq '.'

echo ""
echo "=================================="
echo "测试完成"
