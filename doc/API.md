# Web Screenshot Service — 调用方 API 文档

面向上游系统的 HTTP 接口说明。默认服务地址：

```
http://wbscreenflow.zeabur.app
```

---

## 1. 鉴权

所有 `/api/*` 接口均需携带请求头：

| Header | 值 | 说明 |
|--------|-----|------|
| `x-wb-c` | `1024` | 固定鉴权凭证 |

未携带或值不正确时返回 `403`：

```json
{
  "error": true,
  "message": "no permission",
  "code": "PERMISSION_DENIED"
}
```

---

## 2. 健康检查

### `GET /api/health`

用于探活，确认服务可用。

**请求示例**

```bash
curl -s http://wbscreenflow.zeabur.app/api/health \
  -H "x-wb-c: 1024"
```

**成功响应** `200`

```json
{
  "status": "ok",
  "timestamp": "2026-08-26T11:00:00.000Z"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | string | 固定为 `ok` |
| `timestamp` | string | ISO 8601 时间戳 |

---

## 3. 网页截图

### `POST /api/screenshot`

对指定 URL 截图，按服务端配置与请求参数返回 JSON（含 CDN URL / Base64）或二进制图片。

当 `source` 为 `github` 时：先通过 GitHub API 读取仓库 About 中的官网（`homepage`），用 Puppeteer 打开该官网并截图上传七牛；未配置官网时再回退为 GitHub 仓库页截图。

**Content-Type**：`application/json`  
**Body 上限**：约 10MB

### 3.1 请求参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `url` | string | **是** | — | 目标网页，须为 `http` 或 `https` |
| `source` | string | 否 | — | 传 `github` 时优先截 About 官网；其它值返回 `INVALID_SOURCE` |
| `selector` | string | 否 | — | CSS 选择器；有则截该元素（X URL 有 selector 时跳过 embed）。X 未传时优先 embed，失败再截主帖 `article[data-testid="tweet"]` |
| `width` | number | 否 | `1920` | 视口宽度，范围 `1`–`10000`（仅截图路径） |
| `height` | number | 否 | `1080` | 视口高度，范围 `1`–`10000`（仅截图路径） |
| `fullPage` | boolean | 否 | `false` | `true` 时截取整页（仅截图路径） |
| `format` | string | 否 | `png` | 截图格式 `png` / `jpeg` |
| `quality` | number | 否 | `90` | 仅截图且 `jpeg` 有效，范围 `0`–`100` |
| `waitUntil` | string | 否 | `networkidle0` | 页面就绪条件，见下表（仅截图路径） |
| `timeout` | number | 否 | `30000` | 导航超时（毫秒），范围 `1000`–`300000`（仅截图路径） |
| `returnBase64` | boolean | 否 | `false` | 在 JSON 中额外/优先返回 Base64 |
| `returnBinary` | boolean | 否 | `false` | `true` 时直接返回图片二进制 |
| `viewport` | object | 否 | `{}` | 细粒度视口，见下表 |
| `options` | object | 否 | `{}` | 预留扩展字段，当前可忽略 |

### 3.1.1 GitHub About 官网优先（`source: "github"`）

```
url → GitHub API 读 homepage（About 官网）
      → Puppeteer 打开官网并截图 → 上传七牛 → source: "homepage"
      → 无官网或失败 → Puppeteer 截 GitHub 仓库页 → source: "screenshot"
```

- `url` 须为 `https://github.com/{owner}/{repo}`（可带多余 path，会解析 owner/repo）
- About 官网可能不带 `https://`，服务端会自动补全
- 截图参数（`width` / `height` / `waitUntil` 等）作用于官网页面

### 3.1.2 元素截图与 X 主帖（Embed 优先）

- 传 `selector`：对匹配的第一个元素截图，成功时响应 `source` 为 `"element"`（**不会**走 X embed）
- URL 为 `x.com` / `twitter.com` 的 `/status/{id}` 且**未传** `selector` 时：
  1. **优先**用官方 Embed（`blockquote.twitter-tweet` + `widgets.js`）渲染卡片并截图 → `source: "embed"`
  2. 长文尽力点击 **Show more / Read more** 后再截，尽量拿到全文高度
  3. Embed 失败则回退打开帖子页：移动 UA + 主帖 `article[data-testid="tweet"]` → `source: "element"`
  4. 再失败则整页/视口截图 → `source: "screenshot"` + `warning`
- Embed / 元素截图成功时忽略 `fullPage` / `options.clip`
- 视口尺寸仍由上游 `width` / `height` 决定

**`waitUntil` 可选值**

| 值 | 含义 |
|----|------|
| `load` | `load` 事件触发 |
| `domcontentloaded` | `DOMContentLoaded` 触发 |
| `networkidle0` | 至少 500ms 内无网络连接（默认） |
| `networkidle2` | 至少 500ms 内不超过 2 个网络连接 |

**`viewport` 字段**

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `width` | number | 同 `width` | 视口宽 |
| `height` | number | 同 `height` | 视口高 |
| `deviceScaleFactor` | number | `1` | 设备像素比 |

### 3.2 响应行为（按优先级）

服务按以下顺序决定响应形态：

| 优先级 | 条件 | Content-Type | 结果 |
|--------|------|--------------|------|
| 1 | `returnBinary: true` | `image/png` 或 `image/jpeg` | 图片二进制 body |
| 2 | 已启用七牛自动上传且上传成功 | `application/json` | 含 CDN `url`（生产环境常见路径） |
| 3 | 配置了七牛但上传失败 | `application/json` | `success: true` + `base64` + `warning` / `error` |
| 4 | `returnBase64: true` | `application/json` | 含 `base64` 字段 |
| 5 | 其他 | `application/json` | 含 `base64` Data URL，可能带 `note` |

生产环境（[wbscreenflow.zeabur.app](http://wbscreenflow.zeabur.app/)）通常已配置七牛自动上传：**不传 `returnBinary` 时，成功响应多为 JSON + CDN URL**。

#### 成功：七牛 URL（推荐消费方式）

```json
{
  "success": true,
  "format": "png",
  "url": "https://cdn.example.com/screenshots/1234567890_abc123.png",
  "key": "screenshots/1234567890_abc123.png",
  "hash": "Fh8xVqod2QW1PY...",
  "source": "homepage"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | `true` |
| `format` | string | `png` / `jpeg` |
| `url` | string | 可公网访问的图片地址 |
| `key` | string | 对象存储 key |
| `hash` | string | 存储侧 hash |
| `source` | string | `embed`（X 官方嵌入卡片）、`element`（页面元素截图）、`homepage`（GitHub About 官网）、`screenshot`（整页/视口或最终降级） |
| `warning` | string | 可选；embed/元素失败后降级时说明原因 |
| `warning` | string | 可选；元素截图降级或七牛上传失败等场景下的说明 |
| `base64` | string | 仅当同时传 `returnBase64: true` 时出现 |

#### 成功：Base64 JSON

```json
{
  "success": true,
  "format": "png",
  "base64": "data:image/png;base64,iVBORw0KGgo..."
}
```

`base64` 为 Data URL（`data:image/...;base64,...`）。

#### 成功：二进制

- Header：`Content-Type: image/png` 或 `image/jpeg`
- Body：原始图片字节流
- 建议客户端按 `format` / Content-Type 落盘

#### 成功但七牛上传失败（降级）

```json
{
  "success": true,
  "format": "png",
  "warning": "七牛云上传失败，返回 base64",
  "base64": "data:image/png;base64,...",
  "error": "上传错误信息"
}
```

HTTP 仍可能为 `200`；上游若依赖 `url`，请同时兼容 `base64` 或将 `warning`/`error` 记入监控。

---

## 4. 错误响应

统一 JSON 结构：

```json
{
  "error": true,
  "message": "错误描述",
  "code": "ERROR_CODE"
}
```

| HTTP | code | 说明 |
|------|------|------|
| 403 | `PERMISSION_DENIED` | 缺少或错误的 `x-wb-c` |
| 400 | `MISSING_URL` | 未传 `url` |
| 400 | `INVALID_SOURCE` | `source` 传了非 `github` 的值 |
| 400 | `INVALID_SELECTOR` | `selector` 为空或非法 |
| 400 | `INVALID_URL` | URL 格式非法 |
| 400 | `INVALID_PROTOCOL` | 非 http/https |
| 403 | `DOMAIN_NOT_ALLOWED` | 目标域名不在白名单（服务端启用白名单时） |
| 400 | `INVALID_WIDTH` / `INVALID_HEIGHT` | 宽高越界 |
| 400 | `INVALID_FORMAT` | format 非 png/jpeg |
| 400 | `INVALID_QUALITY` | JPEG quality 越界 |
| 400 | `INVALID_WAIT_UNTIL` | waitUntil 非法 |
| 400 | `INVALID_TIMEOUT` | timeout 越界 |
| 400 | `NETWORK_ERROR` | 无法访问目标页 |
| 408 | `TIMEOUT_ERROR` | 页面导航超时 |
| 404 | `NOT_FOUND` | 路径不存在 |
| 500 | `BROWSER_CREATE_ERROR` | 浏览器实例创建失败 |
| 500 | `INTERNAL_ERROR` | 其他服务端错误 |

---

## 5. 调用示例

### 5.1 默认截图（期望拿到 CDN URL）

```bash
curl -s -X POST http://wbscreenflow.zeabur.app/api/screenshot \
  -H "x-wb-c: 1024" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com"
  }'
```

### 5.1.1 GitHub 仓库（About 官网优先）

```bash
curl -s -X POST http://wbscreenflow.zeabur.app/api/screenshot \
  -H "x-wb-c: 1024" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://github.com/excalidraw/excalidraw",
    "source": "github"
  }'
```

成功且 About 配置了官网时，响应中 `source` 为 `"homepage"`；无官网或官网截图失败时回退仓库页截图，`source` 为 `"screenshot"`。

### 5.1.2 X 帖子主帖截图（移动视口）

```bash
curl -s -X POST https://wbscreenflow.zeabur.app/api/screenshot \
  -H "x-wb-c: 1024" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://x.com/user/status/1234567890",
    "width": 390,
    "height": 844
  }'
```

未传 `selector` 时优先走官方 Embed，成功时 `source` 为 `"embed"`；Embed 失败回退帖子页主帖为 `"element"`；再失败为 `"screenshot"` 并带 `warning`。长文会尽力展开后再截。

### 5.2 整页 + JPEG

```bash
curl -s -X POST http://wbscreenflow.zeabur.app/api/screenshot \
  -H "x-wb-c: 1024" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "fullPage": true,
    "format": "jpeg",
    "quality": 85
  }'
```

### 5.3 返回二进制并保存文件

```bash
curl -s -X POST http://wbscreenflow.zeabur.app/api/screenshot \
  -H "x-wb-c: 1024" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "returnBinary": true
  }' \
  --output screenshot.png
```

### 5.4 移动端视口

```bash
curl -s -X POST http://wbscreenflow.zeabur.app/api/screenshot \
  -H "x-wb-c: 1024" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "width": 375,
    "height": 667
  }'
```

### 5.5 Node.js (fetch)

```js
const res = await fetch('http://wbscreenflow.zeabur.app/api/screenshot', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-wb-c': '1024',
  },
  body: JSON.stringify({
    url: 'https://example.com',
    fullPage: false,
  }),
});

if (!res.ok) {
  const err = await res.json();
  throw new Error(`${err.code}: ${err.message}`);
}

const data = await res.json();
// 生产常见：data.url 为 CDN 地址
console.log(data.url || data.base64?.slice(0, 64));
```

---

## 6. 注意事项

1. **鉴权必带**：所有 `/api` 请求（含 health）都需要 `x-wb-c: 1024`。
2. **耗时**：普通截图依赖目标站加载，默认超时 30s；`source: "github"` 需先调 GitHub API 再开浏览器截官网。
3. **优先用 `url` 字段**：生产侧通常返回七牛 CDN；仅在需要本地落盘或调试时用 `returnBinary` / `returnBase64`。
4. **`fullPage: true`** 可能产出很大的图片，注意下游存储与带宽。
5. **白名单**：若服务端配置了 `ALLOWED_DOMAINS`，非白名单域名会返回 `DOMAIN_NOT_ALLOWED`。
6. **幂等**：同一 URL 多次调用会生成新截图（新 key / 新文件），不保证缓存命中。
7. **GitHub 限额**：服务端可配置环境变量 `GITHUB_TOKEN` 以提高 GitHub API 限额；未配置也能工作，但更容易触发限流并回退仓库页截图。

---

## 7. 接口一览

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 健康检查 |
| `POST` | `/api/screenshot` | 网页截图 |

根路径 `GET /` 返回服务元信息，无需鉴权，一般不必给业务调用方使用。
