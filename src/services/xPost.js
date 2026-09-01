/**
 * X / Twitter 帖子页辅助（主帖元素截图）
 */

const DEFAULT_TWEET_SELECTOR = 'ul > li:first-child';

/** 主帖候选选择器（按优先级） */
const TWEET_SELECTOR_CANDIDATES = [
  'ul > li:first-child',
];

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
  const isXHost = [
    'x.com',
    'www.x.com',
    'twitter.com',
    'www.twitter.com',
    'mobile.twitter.com',
    'mobile.x.com',
  ].includes(host);
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
 * X 帖子页用桌面 UA：移动 UA 易出 App 引导且服务端常不出主帖 DOM
 * @param {string} url
 * @returns {string}
 */
function userAgentForUrl(url) {
  // 视口尺寸仍由上游决定；UA 统一桌面，提高主帖 DOM 出现率
  return DESKTOP_UA;
}

/**
 * 解析应用哪些选择器
 * @param {string} url
 * @param {string|undefined} selector
 * @returns {string[]}
 */
function selectorCandidatesFor(url, selector) {
  if (selector && typeof selector === 'string' && selector.trim()) {
    return [selector.trim()];
  }
  if (isXStatusUrl(url)) return [...TWEET_SELECTOR_CANDIDATES];
  return [];
}

module.exports = {
  DEFAULT_TWEET_SELECTOR,
  TWEET_SELECTOR_CANDIDATES,
  MOBILE_UA,
  DESKTOP_UA,
  isXStatusUrl,
  resolveSelector,
  userAgentForUrl,
  selectorCandidatesFor,
};
