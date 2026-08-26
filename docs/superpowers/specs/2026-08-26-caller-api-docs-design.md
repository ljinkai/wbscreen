# 上游调用方 API 文档设计

**日期**：2026-08-26  
**状态**：已确认

## 目标

为上游调用方提供独立、可直接联调的中文 API 手册，不包含部署与运维配置。

## 决策

- 格式：独立 Markdown（`doc/API.md`）
- Base URL：`http://wbscreenflow.zeabur.app`
- 范围：鉴权、健康检查、截图接口、参数约束、响应分支、错误码、调用示例
- 不包含：Docker、环境变量、七牛密钥、浏览器池等服务端配置

## 文档结构

1. 概述与 Base URL
2. 鉴权（`x-wb-c`）
3. `GET /api/health`
4. `POST /api/screenshot`（参数表 + 响应分支）
5. 错误码表
6. 调用示例（curl / fetch）
7. 注意事项

## 交付物

- `doc/API.md` — 给上游的正式调用文档
