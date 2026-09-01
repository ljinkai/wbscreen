/**
 * X / Twitter 官方 Embed 截图辅助
 */

/**
 * @param {string} url
 * @returns {{ username: string, statusId: string, statusUrl: string } | null}
 */
function parseStatusUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(host)) {
    return null;
  }
  const m = parsed.pathname.match(/\/([^/]+)\/status\/(\d+)/i);
  if (!m) return null;
  const username = m[1];
  const statusId = m[2];
  return {
    username,
    statusId,
    statusUrl: `https://x.com/${username}/status/${statusId}`,
  };
}

/**
 * @param {{ username: string, statusId: string, statusUrl: string }} status
 * @returns {string}
 */
function buildEmbedHtml(status) {
  const href = status.statusUrl;
  const user = status.username || 'i';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body {
      margin: 0;
      padding: 16px;
      background: #ffffff;
    }
    .wrap {
      max-width: 550px;
      margin: 0 auto;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <blockquote class="twitter-tweet" data-dnt="true" data-conversation="none">
      <p lang="en" dir="ltr"></p>
      &mdash; @${user}
      <a href="${href}"></a>
    </blockquote>
  </div>
  <script async src="https://platform.x.com/widgets.js" charset="utf-8"></script>
</body>
</html>`;
}

/**
 * 等待 embed widget 渲染出可截图节点
 * @param {import('puppeteer').Page} page
 * @param {number} timeout
 * @returns {Promise<import('puppeteer').ElementHandle>}
 */
async function waitForEmbedCard(page, timeout) {
  await page.waitForFunction(
    () => {
      const iframe = document.querySelector('iframe[id^="twitter-widget-"], iframe[src*="platform.twitter.com"], iframe[src*="platform.x.com"]');
      if (iframe && iframe.offsetHeight > 40) return true;
      const rendered = document.querySelector('.twitter-tweet-rendered');
      return !!(rendered && rendered.offsetHeight > 40);
    },
    { timeout }
  );

  const iframe = await page.$('iframe[id^="twitter-widget-"], iframe[src*="platform.twitter.com"], iframe[src*="platform.x.com"]');
  if (iframe) return iframe;

  const rendered = await page.$('.twitter-tweet-rendered, blockquote.twitter-tweet');
  if (rendered) return rendered;

  throw new Error('embed card not found');
}

/**
 * 在 embed iframe 内尽力展开长文（Show more / Read more）
 * @param {import('puppeteer').Page} page
 */
async function expandEmbedLongText(page) {
  const frames = page.frames();
  for (const frame of frames) {
    try {
      const clicked = await frame.evaluate(() => {
        const labels = ['Show more', 'Read more', 'Show this thread', '显示更多', '阅读更多'];
        const nodes = Array.from(
          document.querySelectorAll('button, div[role="button"], span[role="button"], a')
        );
        for (const node of nodes) {
          const t = (node.textContent || '').trim();
          if (!t || t.length > 48) continue;
          if (labels.some((l) => t === l || t.startsWith(l))) {
            node.click();
            return t;
          }
        }
        return null;
      });
      if (clicked) {
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch {
      // cross-origin or detached — ignore
    }
  }
}

module.exports = {
  parseStatusUrl,
  buildEmbedHtml,
  waitForEmbedCard,
  expandEmbedLongText,
};
