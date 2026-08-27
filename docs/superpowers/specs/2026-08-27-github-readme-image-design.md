# GitHub README 优先截图设计

**日期**：2026-08-27  
**状态**：已确认

## 目标

在 `POST /api/screenshot` 上增加 `source: "github"`：对 GitHub 仓库 URL 先从 README 提取产品图并上传七牛；无可用图时再走现有 Puppeteer 截图。

## 决策

- 放在 wbscreen，扩展现有接口，不新建独立业务路径
- 参数：`source: "github"`
- 只取 1 张封面图；过滤 badge
- 成功后上传七牛（与现有截图一致）
- 响应增加 `source: "readme" | "screenshot"`
- 可选 `GITHUB_TOKEN` 提高 API 限额

## 流程

1. 解析 `owner/repo`
2. GitHub Contents API 拉 README（不开浏览器）
3. 解析 markdown/html 图片 → 过滤 → 下载第一张
4. 上传七牛并返回
5. 任一步失败 → fallback Puppeteer

## 非目标

- 多图返回、Social Preview、docs/ 目录扫描
