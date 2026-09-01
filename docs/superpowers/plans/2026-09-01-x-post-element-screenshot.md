# X Post Element Screenshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional CSS `selector` element screenshots; for X/Twitter status URLs auto-use mobile UA + built-in main-tweet selector, with fallback to page screenshot + `warning`.

**Architecture:** Pure helpers in `xPost.js` decide if a URL is an X status post, provide mobile UA and default selector, and resolve the effective selector. `takeScreenshot` sets UA before navigation, then either screenshots an element or the page; element failures degrade without throwing. Validator accepts optional `selector`; route forwards `warning` in JSON responses.

**Tech Stack:** Node.js, Express, Puppeteer, existing `node:test` unit tests, Qiniu upload unchanged.

**Spec:** `docs/superpowers/specs/2026-09-01-x-post-element-screenshot-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `src/services/xPost.js` | `isXStatusUrl`, `MOBILE_UA`, `DEFAULT_TWEET_SELECTOR`, `resolveSelector(url, selector)` |
| `src/services/xPost.test.js` | Unit tests for URL / selector resolution |
| `src/utils/validator.js` | Optional `selector` validation → `INVALID_SELECTOR` |
| `src/services/screenshotService.js` | Mobile UA for X, dismiss overlays, element screenshot + fallback |
| `src/routes/screenshot.js` | Include `warning` in JSON via `withSource` |
| `doc/API.md` | Document `selector`, X behavior, `source` / `warning` |

---

### Task 1: `xPost` helpers (TDD)

**Files:**
- Create: `src/services/xPost.js`
- Create: `src/services/xPost.test.js`

- [ ] **Step 1: Write failing tests**

Create `src/services/xPost.test.js`:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isXStatusUrl,
  resolveSelector,
  DEFAULT_TWEET_SELECTOR,
} = require('./xPost');

describe('isXStatusUrl', () => {
  it('accepts x.com and twitter.com status urls', () => {
    assert.equal(isXStatusUrl('https://x.com/user/status/123'), true);
    assert.equal(isXStatusUrl('https://www.x.com/user/status/123'), true);
    assert.equal(isXStatusUrl('https://twitter.com/user/status/123'), true);
    assert.equal(isXStatusUrl('https://www.twitter.com/user/status/123/photo/1'), true);
  });

  it('rejects non-status and non-x hosts', () => {
    assert.equal(isXStatusUrl('https://x.com/user'), false);
    assert.equal(isXStatusUrl('https://example.com/user/status/123'), false);
    assert.equal(isXStatusUrl('not-a-url'), false);
  });
});

describe('resolveSelector', () => {
  it('prefers explicit selector', () => {
    assert.equal(
      resolveSelector('https://x.com/u/status/1', '.custom'),
      '.custom'
    );
  });

  it('uses default tweet selector for x status without explicit', () => {
    assert.equal(
      resolveSelector('https://x.com/u/status/1', undefined),
      DEFAULT_TWEET_SELECTOR
    );
  });

  it('returns undefined for non-x without explicit selector', () => {
    assert.equal(resolveSelector('https://example.com/a', undefined), undefined);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node --test src/services/xPost.test.js`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `xPost.js`**

Create `src/services/xPost.js`:

```js
/**
 * X / Twitter 帖子页辅助（主帖元素截图）
 */

const DEFAULT_TWEET_SELECTOR = 'article[data-testid="tweet"]';

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * @param {string} url
 * @returns {boolean}
 */
function isXStatusUrl(url) {
  if (!url || typeof url !== 'string') return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  const isXHost = ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(host);
  if (!isXHost) return false;
  return /\/status\/\d+/i.test(parsed.pathname);
}

/**
 * @param {string} url
 * @param {string|undefined} selector
 * @returns {string|undefined}
 */
function resolveSelector(url, selector) {
  if (selector && typeof selector === 'string' && selector.trim()) {
    return selector.trim();
  }
  if (isXStatusUrl(url)) return DEFAULT_TWEET_SELECTOR;
  return undefined;
}

/**
 * @param {string} url
 * @returns {string}
 */
function userAgentForUrl(url) {
  return isXStatusUrl(url) ? MOBILE_UA : DESKTOP_UA;
}

module.exports = {
  DEFAULT_TWEET_SELECTOR,
  MOBILE_UA,
  DESKTOP_UA,
  isXStatusUrl,
  resolveSelector,
  userAgentForUrl,
};
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `node --test src/services/xPost.test.js`  
Expected: all pass

- [ ] **Step 5: Commit** (only if user asked to commit; otherwise skip)

```bash
git add src/services/xPost.js src/services/xPost.test.js
git commit -m "$(cat <<'EOF'
feat: add X status URL helpers for element screenshots

EOF
)"
```

---

### Task 2: Validate optional `selector`

**Files:**
- Modify: `src/utils/validator.js`

- [ ] **Step 1: Add `selector` to params + validation**

In `validateScreenshotParams`, after building `params` (around the `source` line), add:

```js
selector:
  body.selector === undefined || body.selector === null
    ? undefined
    : String(body.selector),
```

After the `source` validation block, add:

```js
if (params.selector !== undefined) {
  const trimmed = params.selector.trim();
  if (!trimmed) {
    throw new AppError('selector 不能为空', 'INVALID_SELECTOR', 400);
  }
  params.selector = trimmed;
}
```

Note: if `body.selector` is a non-string (e.g. number/`true`), `String(...)` still yields a value; empty after trim → `INVALID_SELECTOR`. If callers send `selector: ""`, same error. Spec: non-empty string required when present.

- [ ] **Step 2: Quick sanity check**

Run: `node -e "const { validateScreenshotParams } = require('./src/utils/validator'); try { validateScreenshotParams({ url: 'https://example.com', selector: '' }); console.log('fail'); } catch (e) { console.log(e.code); }"`  
Expected: `INVALID_SELECTOR`

- [ ] **Step 3: Commit** (if user asked)

```bash
git add src/utils/validator.js
git commit -m "$(cat <<'EOF'
feat: validate optional screenshot selector

EOF
)"
```

---

### Task 3: Element screenshot + X mobile UA + fallback in `takeScreenshot`

**Files:**
- Modify: `src/services/screenshotService.js`

- [ ] **Step 1: Require `xPost`**

At top of `screenshotService.js`, replace nothing for github; add:

```js
const xPost = require('./xPost');
```

- [ ] **Step 2: Add overlay dismiss helper (same file, above `takeScreenshot`)**

```js
/**
 * 尽力关闭常见遮挡层（失败忽略）
 */
async function dismissBlockingOverlays(page) {
  const candidates = [
    '[aria-label="Close"]',
    '[data-testid="xMigrationBottomBar"] [role="button"]',
    'div[role="dialog"] [aria-label="Close"]',
    'button[data-testid="confirmationSheetConfirm"]',
  ];
  for (const sel of candidates) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.click({ delay: 20 }).catch(() => {});
        await el.dispose().catch(() => {});
      }
    } catch {
      // ignore
    }
  }
  // Best-effort text buttons
  try {
    await page.evaluate(() => {
      const texts = ['Not now', 'Close', 'Dismiss', '拒绝', '关闭'];
      const nodes = Array.from(document.querySelectorAll('button, div[role="button"], span[role="button"]'));
      for (const node of nodes) {
        const t = (node.textContent || '').trim();
        if (texts.some((x) => t === x || t.includes(x))) {
          node.click();
          break;
        }
      }
    });
  } catch {
    // ignore
  }
}
```

- [ ] **Step 3: Add page screenshot options builder**

```js
function buildPageScreenshotOptions(params) {
  const screenshotOptions = {
    type: params.format,
    fullPage: params.fullPage,
  };
  if (params.format.toLowerCase() === 'jpeg') {
    screenshotOptions.quality = params.quality;
  }
  if (params.options && params.options.clip) {
    screenshotOptions.clip = params.options.clip;
  }
  return screenshotOptions;
}

function attachBase64(result, params) {
  if (!params.returnBase64) return;
  const mimeType = params.format.toLowerCase() === 'jpeg' ? 'image/jpeg' : 'image/png';
  result.base64 = `data:${mimeType};base64,${result.buffer.toString('base64')}`;
}
```

- [ ] **Step 4: Rewrite screenshot capture section inside `takeScreenshot`**

Replace from `// 设置用户代理` through building `result` / base64 / qiniu with:

```js
    await page.setUserAgent(xPost.userAgentForUrl(params.url));

    await page.goto(params.url, {
      waitUntil: params.waitUntil,
      timeout: params.timeout,
    });

    const effectiveSelector = xPost.resolveSelector(params.url, params.selector);
    let screenshot;
    let source = 'screenshot';
    let warning;

    if (effectiveSelector) {
      try {
        await dismissBlockingOverlays(page);
        await page.waitForSelector(effectiveSelector, { timeout: params.timeout });
        const handle = await page.$(effectiveSelector);
        if (!handle) {
          throw new Error(`selector not found: ${effectiveSelector}`);
        }
        const elementOpts = { type: params.format };
        if (params.format.toLowerCase() === 'jpeg') {
          elementOpts.quality = params.quality;
        }
        screenshot = await handle.screenshot(elementOpts);
        await handle.dispose().catch(() => {});
        source = 'element';
      } catch (elementError) {
        console.warn('元素截图失败，降级整页:', elementError.message);
        warning = `元素截图失败，已降级整页: ${elementError.message}`;
        screenshot = await page.screenshot(buildPageScreenshotOptions(params));
        source = 'screenshot';
      }
    } else {
      screenshot = await page.screenshot(buildPageScreenshotOptions(params));
    }

    const result = {
      buffer: screenshot,
      format: params.format,
      source,
      ...(warning ? { warning } : {}),
    };

    attachBase64(result, params);
    await attachQiniuUpload(result);
    return result;
```

Keep the existing `catch` / `finally` of `takeScreenshot` unchanged.

- [ ] **Step 5: Run unit tests**

Run: `npm test`  
Expected: existing + `xPost` tests pass

- [ ] **Step 6: Commit** (if user asked)

```bash
git add src/services/screenshotService.js
git commit -m "$(cat <<'EOF'
feat: element screenshot with X mobile UA and page fallback

EOF
)"
```

---

### Task 4: Forward `warning` in API responses

**Files:**
- Modify: `src/routes/screenshot.js`

- [ ] **Step 1: Extend `withSource`**

```js
function withSource(payload, result) {
  return {
    ...payload,
    ...(result.source ? { source: result.source } : {}),
    ...(result.homepageUrl ? { homepageUrl: result.homepageUrl } : {}),
    ...(result.warning ? { warning: result.warning } : {}),
  };
}
```

Also set header when binary:

```js
      if (result.warning) {
        res.setHeader('X-Image-Warning', result.warning.slice(0, 200));
      }
```

(place next to existing `X-Image-Source` block)

- [ ] **Step 2: Commit** (if user asked)

```bash
git add src/routes/screenshot.js
git commit -m "$(cat <<'EOF'
feat: include screenshot warning in API responses

EOF
)"
```

---

### Task 5: Update `doc/API.md`

**Files:**
- Modify: `doc/API.md`

- [ ] **Step 1: Document `selector` in parameter table**

Add row after `source`:

| `selector` | string | 否 | — | CSS 选择器；有则截该元素。X 帖子 URL 未传时默认主帖 `article[data-testid="tweet"]` |

- [ ] **Step 2: Add section after GitHub section (new 3.1.2)**

```markdown
### 3.1.2 元素截图与 X 主帖

- 传 `selector`：对匹配的第一个元素截图，成功时响应 `source` 为 `"element"`
- URL 为 `x.com` / `twitter.com` 的 `/status/{id}` 帖子页时：
  - 自动使用**移动 User-Agent**（视口尺寸仍由 `width`/`height` 决定）
  - 未传 `selector` 时默认截主帖（时间线第一条 `article[data-testid="tweet"]`）
- 元素等待或截图失败时：**降级**为整页/视口截图，`source` 为 `"screenshot"`，并带 `warning` 说明原因
- 元素截图成功时忽略 `fullPage` / `options.clip`
```

- [ ] **Step 3: Update success field table for `source`**

Extend `source` description to include `element` / `homepage` / `screenshot`.

Add `warning` row: 可选；元素截图降级时出现。

Add error code row: `400` / `INVALID_SELECTOR` — `selector` 为空或非法。

Add curl example for X status with width/height 390×844.

- [ ] **Step 4: Commit** (if user asked)

```bash
git add doc/API.md
git commit -m "$(cat <<'EOF'
docs: document selector and X main-post screenshots

EOF
)"
```

---

### Task 6: Spec status + smoke check

**Files:**
- Modify: `docs/superpowers/specs/2026-09-01-x-post-element-screenshot-design.md` (status → 已确认/实现中)

- [ ] **Step 1: Mark spec status `已确认`**

- [ ] **Step 2: Run full test suite**

Run: `npm test`  
Expected: all pass

- [ ] **Step 3: Optional local smoke** (requires running server + network)

```bash
curl -s -X POST http://localhost:3000/api/screenshot \
  -H "x-wb-c: 1024" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","selector":"h1","width":390,"height":800,"returnBase64":true}' | head -c 200
```

Expected: JSON with `source":"element"` or `warning` if selector missing on that page.

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Optional `selector` param | Task 2 |
| X status auto selector + mobile UA | Task 1 + 3 |
| Upstream dimensions unchanged | Task 3 (uses existing viewport) |
| Dismiss overlays best-effort | Task 3 |
| Fallback + `warning` | Task 3 + 4 |
| `source: element \| screenshot` | Task 3 |
| `INVALID_SELECTOR` | Task 2 + 5 |
| No login/cookie | N/A (not implemented) |
| API docs | Task 5 |
| Unit tests URL/selector | Task 1 |

## Execution notes

- Do **not** commit unless the user explicitly asks.
- Prefer not to hit live X in CI; unit tests cover URL/selector only.
- If X DOM changes, only update `DEFAULT_TWEET_SELECTOR` in `xPost.js`.
