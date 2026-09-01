# X 主帖元素截图设计

**日期**：2026-09-01  
**状态**：已确认（已扩展：X Embed 优先 + 长文 Show more）

## 目标

支持只截取页面中指定元素；对 X（Twitter）帖子 URL **优先**用官方 Embed 卡片截图（长文尽力展开），失败再回退帖子页主帖元素截图；元素/embed 失败时降级整页并标注。

## 决策摘要

| 项 | 决定 |
|----|------|
| 能力组合 | 通用 `selector` + X `/status/` **Embed 优先** + 帖子页主帖回退 |
| 尺寸 | 上游传 `width` / `height` |
| UA | Embed 用桌面 UA；帖子页回退用移动 UA |
| 长文 | Embed iframe 内尽力点击 Show more / Read more 后再截 |
| `source` | `embed` / `element` / `screenshot`（及既有 `homepage`） |
| 失败策略 | embed → 帖子页 element → 整页 + `warning` |

## API

### 新参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `selector` | string | 否 | — | CSS 选择器；有则对该元素截图，可覆盖 X 内置选择器 |

现有参数（`url`、`width`、`height`、`fullPage`、`format`、`quality`、`waitUntil`、`timeout`、`viewport`、`returnBase64`、`returnBinary`、`source` 等）不变。

### 自动触发（无需新 `source` 枚举值）

当 `url` 主机为 `x.com` / `www.x.com` / `twitter.com` / `www.twitter.com`，且 pathname 匹配 `/status/`（帖子页）时：

1. 在导航前设置**移动 User-Agent**
2. 若请求未传 `selector`，使用内置主帖选择器
3. 若请求传了 `selector`，以请求为准

非 X URL：仅在显式传入 `selector` 时走元素截图。

### 响应字段

| 字段 | 含义 |
|------|------|
| `source: "element"` | 元素截图成功（含 X 主帖） |
| `source: "screenshot"` | 整页/视口截图（含元素截失败后的降级） |
| `warning` | 可选；降级时说明原因（如主帖选择器超时） |

GitHub 路径既有 `homepage` 等取值保持不变。

### 调用示例

X 主帖（上游传手机尺寸）：

```json
{
  "url": "https://x.com/user/status/123",
  "width": 390,
  "height": 844
}
```

通用元素截图：

```json
{
  "url": "https://example.com/post/1",
  "selector": ".post-card",
  "width": 390,
  "height": 800
}
```

## 页面流程

```
setViewport(params.viewport)
  → 若是 X 帖：setUserAgent(移动 UA)；否则现有桌面 UA
  → page.goto(url, waitUntil, timeout)
  → 解析有效 selector：
       · 请求带 selector → 用请求的
       · 否则若是 X /status/ → 内置主帖选择器
       · 否则 → 无 selector
  → 有 selector 时：
       1. 尽力关闭常见遮挡（Cookie / 登录引导等；找不到则忽略）
       2. waitForSelector(selector, timeout = params.timeout)
       3. 取目标元素：X 取第一个匹配的主帖 article；其它取第一个匹配
       4. element.screenshot() → source: "element"
       5. 任一步失败 → page.screenshot(...) → source: "screenshot" + warning
  → 无 selector：现有 page.screenshot 逻辑 → source: "screenshot"
  → attachQiniuUpload / base64 与现有一致
```

### X 主帖规则

帖子页常有多条 `article[data-testid="tweet"]`（主帖 + 回复）。取**第一个**匹配元素作为主帖。

内置选择器初值：`article[data-testid="tweet"]`（可按联调实测微调，集中在 `xPost.js`）。

### 遮挡处理

- 尽力点击常见关闭类控件（如 Close / Not now）；失败忽略
- 不登录、不注入 Cookie
- 等不到主帖 → 降级整页，不返回硬错误

### 与 `fullPage` / `clip` 的关系

| 情况 | 行为 |
|------|------|
| 元素截图成功 | 忽略 `fullPage`；不叠加 `options.clip`（元素边界即裁剪区） |
| 降级或无 selector | 仍尊重 `fullPage` / `options.clip` |

## 校验与错误码

| 情况 | 行为 |
|------|------|
| `selector` 存在但非非空字符串 | `400` / `INVALID_SELECTOR` |
| 元素截失败后降级成功 | `200` + `warning`，非错误 |
| 整页也失败 | 沿用 `TIMEOUT_ERROR` / `NETWORK_ERROR` / `SCREENSHOT_ERROR` |

不新增「主帖找不到」硬错误码。

## 实现范围

| 文件 | 改动 |
|------|------|
| `src/utils/validator.js` | 可选 `selector` 校验 |
| `src/services/xPost.js` | 新建：是否 X 帖 URL、内置选择器、移动 UA |
| `src/services/xPost.test.js` | 新建：URL / 选择器解析单测 |
| `src/services/screenshotService.js` | 元素截图、X UA、弹层尽力关、降级 |
| `doc/API.md` | 文档同步 |

路由与七牛上传逻辑基本不动。

## 非目标

- 登录态 / Cookie 注入
- 截取回复楼层（仅主帖）
- 服务端写死手机分辨率
- 新增 `source: "x"` 请求参数（用 URL 自动识别即可）

## 测试计划

- 单元：`isXStatusUrl`、有效 selector 解析（显式 / X 默认 / 非 X 无默认）
- 手工或联调：真实 X 帖子 URL + 手机尺寸；无 selector 的普通 URL 行为不变；非法 `selector` 返回 `INVALID_SELECTOR`
