/**
 * 参数验证工具
 */
const { AppError } = require('./errorHandler');
const config = require('../config/default');

/**
 * 验证 URL 格式
 */
function validateUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new AppError('URL 参数是必填项', 'MISSING_URL', 400);
  }

  try {
    const urlObj = new URL(url);

    // 检查协议
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      throw new AppError('URL 必须使用 http 或 https 协议', 'INVALID_PROTOCOL', 400);
    }

    // 检查域名白名单
    if (config.security.allowedDomains.length > 0) {
      const hostname = urlObj.hostname;
      const isAllowed = config.security.allowedDomains.some((domain) => {
        if (domain.startsWith('.')) {
          // 支持子域名匹配，如 .example.com
          return hostname === domain.slice(1) || hostname.endsWith(domain);
        }
        return hostname === domain;
      });

      if (!isAllowed) {
        throw new AppError('该域名不在允许列表中', 'DOMAIN_NOT_ALLOWED', 403);
      }
    }

    return true;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('URL 格式不正确', 'INVALID_URL', 400);
  }
}

function parseBool(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  if (value === true || value === 'true' || value === 1 || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === 0 || value === '0') {
    return false;
  }
  return defaultValue;
}

function parseOpacity(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, n));
}

/**
 * 普通请求默认不加水印；source=github 默认开启。请求参数可覆盖。
 * 支持：
 * - watermark: true|false
 * - watermark: { enabled?, text?, position?, opacity? }
 * - watermarkText / watermarkPosition / watermarkOpacity
 */
function resolveWatermark(body, source) {
  const defaults = config.watermark || {};
  const githubDefaultOn = source === 'github';
  const wmObj =
    body && typeof body.watermark === 'object' && body.watermark !== null
      ? body.watermark
      : null;

  let enabled = githubDefaultOn;
  if (wmObj && Object.prototype.hasOwnProperty.call(wmObj, 'enabled')) {
    enabled = parseBool(wmObj.enabled, githubDefaultOn);
  } else if (
    body &&
    (typeof body.watermark === 'boolean' ||
      typeof body.watermark === 'string' ||
      typeof body.watermark === 'number')
  ) {
    enabled = parseBool(body.watermark, githubDefaultOn);
  } else if (body && body.watermarkEnabled !== undefined) {
    enabled = parseBool(body.watermarkEnabled, githubDefaultOn);
  }

  const text =
    (body && body.watermarkText) ||
    (wmObj && wmObj.text) ||
    defaults.text ||
    'ezindie.com';
  const position =
    (body && body.watermarkPosition) ||
    (wmObj && wmObj.position) ||
    defaults.position ||
    'bottom-right';
  const opacity = parseOpacity(
    (body && body.watermarkOpacity) ?? (wmObj && wmObj.opacity),
    Number.isFinite(defaults.opacity) ? defaults.opacity : 0.72
  );

  return {
    enabled,
    text: String(text),
    position: String(position),
    opacity,
  };
}

/**
 * 验证和规范化截图参数
 */
function validateScreenshotParams(body) {
  const params = {
    url: body.url,
    width: parseInt(body.width) || config.screenshot.width,
    height: parseInt(body.height) || config.screenshot.height,
    fullPage: body.fullPage === true || body.fullPage === 'true',
    format: body.format || config.screenshot.format,
    quality: parseInt(body.quality) || config.screenshot.quality,
    waitUntil: body.waitUntil || config.screenshot.waitUntil,
    timeout: parseInt(body.timeout) || config.screenshot.timeout,
    viewport: body.viewport || {},
    options: body.options || {},
    returnBase64: body.returnBase64 === true || body.returnBase64 === 'true',
    returnBinary: body.returnBinary === true || body.returnBinary === 'true',
    source: body.source ? String(body.source).toLowerCase() : undefined,
    selector:
      body.selector === undefined || body.selector === null
        ? undefined
        : String(body.selector),
  };

  // 验证 URL
  validateUrl(params.url);

  if (params.source && params.source !== 'github') {
    throw new AppError('source 仅支持 github', 'INVALID_SOURCE', 400);
  }

  if (params.selector !== undefined) {
    const trimmed = params.selector.trim();
    if (!trimmed) {
      throw new AppError('selector 不能为空', 'INVALID_SELECTOR', 400);
    }
    params.selector = trimmed;
  }

  // 验证视口尺寸
  if (params.width < 1 || params.width > 10000) {
    throw new AppError('宽度必须在 1-10000 之间', 'INVALID_WIDTH', 400);
  }

  if (params.height < 1 || params.height > 10000) {
    throw new AppError('高度必须在 1-10000 之间', 'INVALID_HEIGHT', 400);
  }

  // 验证图片格式
  if (!['png', 'jpeg'].includes(params.format.toLowerCase())) {
    throw new AppError('图片格式必须是 png 或 jpeg', 'INVALID_FORMAT', 400);
  }

  // 验证质量（仅 JPEG）
  if (params.format.toLowerCase() === 'jpeg') {
    if (params.quality < 0 || params.quality > 100) {
      throw new AppError('JPEG 质量必须在 0-100 之间', 'INVALID_QUALITY', 400);
    }
  }

  // 验证等待条件
  const validWaitUntil = ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'];
  if (!validWaitUntil.includes(params.waitUntil)) {
    throw new AppError(`等待条件必须是: ${validWaitUntil.join(', ')}`, 'INVALID_WAIT_UNTIL', 400);
  }

  // 验证超时时间
  if (params.timeout < 1000 || params.timeout > 300000) {
    throw new AppError('超时时间必须在 1000-300000 毫秒之间', 'INVALID_TIMEOUT', 400);
  }

  // 规范化视口配置
  params.viewport = {
    width: params.viewport.width || params.width,
    height: params.viewport.height || params.height,
    deviceScaleFactor: params.viewport.deviceScaleFactor || 1,
  };

  params.watermark = resolveWatermark(body || {}, params.source);

  return params;
}

module.exports = {
  validateUrl,
  validateScreenshotParams,
  resolveWatermark,
  parseBool,
};
