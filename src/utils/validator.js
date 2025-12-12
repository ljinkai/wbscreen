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
      const isAllowed = config.security.allowedDomains.some(domain => {
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
  };
  
  // 验证 URL
  validateUrl(params.url);
  
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
  
  return params;
}

module.exports = {
  validateUrl,
  validateScreenshotParams,
};

