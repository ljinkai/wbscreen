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
