/**
 * 在截图 buffer 上叠加文字水印（复用已有 browser，避免额外 launch）
 */

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function positionStyle(position) {
  switch ((position || 'bottom-right').toLowerCase()) {
    case 'bottom-left':
      return 'left:14px;bottom:10px;';
    case 'top-right':
      return 'right:14px;top:10px;';
    case 'top-left':
      return 'left:14px;top:10px;';
    case 'bottom-right':
    default:
      return 'right:14px;bottom:10px;';
  }
}

/**
 * @param {import('puppeteer').Browser} browser
 * @param {Buffer} buffer
 * @param {{ text?: string, position?: string, opacity?: number }} watermark
 * @param {string} format
 * @returns {Promise<Buffer>}
 */
async function applyTextWatermark(browser, buffer, watermark, format) {
  const text = (watermark && watermark.text) || 'ezindie.com';
  const opacity = Number.isFinite(watermark?.opacity)
    ? Math.min(1, Math.max(0, watermark.opacity))
    : 0.72;
  const pos = positionStyle(watermark?.position);
  const mime = String(format || 'png').toLowerCase() === 'jpeg' ? 'image/jpeg' : 'image/png';
  const type = mime === 'image/jpeg' ? 'jpeg' : 'png';
  const b64 = buffer.toString('base64');

  const page = await browser.newPage();
  try {
    await page.setContent(
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #fff; }
    .wrap { position: relative; display: inline-block; line-height: 0; }
    img { display: block; max-width: none; }
    .wm {
      position: absolute;
      ${pos}
      font: 12px/1 -apple-system, BlinkMacSystemFont, "PingFang SC",
        "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      color: rgba(156, 163, 175, ${opacity});
      letter-spacing: 0.02em;
      pointer-events: none;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <img src="data:${mime};base64,${b64}" alt="" />
    <div class="wm">${escapeHtml(text)}</div>
  </div>
</body>
</html>`,
      { waitUntil: 'load' }
    );
    await page.waitForSelector('img');
    // ensure image decoded
    await page.evaluate(async () => {
      const img = document.querySelector('img');
      if (img && !img.complete) {
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
      }
    });
    const wrap = await page.$('.wrap');
    if (!wrap) {
      return buffer;
    }
    const shotOpts = { type, omitBackground: false };
    if (type === 'jpeg') {
      shotOpts.quality = 90;
    }
    return await wrap.screenshot(shotOpts);
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = {
  applyTextWatermark,
  escapeHtml,
  positionStyle,
};
