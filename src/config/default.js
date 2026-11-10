function integerEnv(name, fallback, min = 1) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value >= min ? value : fallback;
}

/**
 * 默认配置
 */
module.exports = {
  // 服务器配置
  port: process.env.PORT || 3000,
  
  // Puppeteer 配置
  puppeteer: {
    headless: process.env.PUPPETEER_HEADLESS !== 'false',
    args: process.env.PUPPETEER_ARGS 
      ? process.env.PUPPETEER_ARGS.split(',')
      : ['--no-sandbox', '--disable-setuid-sandbox'],
  },
  
  // 性能配置
  performance: {
    maxConcurrentRequests: integerEnv('MAX_CONCURRENT_REQUESTS', 2),
    browserIdleTimeout: integerEnv('BROWSER_IDLE_TIMEOUT_MS', 30000, 0),
    browserPoolSize: integerEnv('BROWSER_POOL_SIZE', 1),
    requestTimeout: integerEnv('REQUEST_TIMEOUT', 30000),
  },
  
  // 默认截图配置
  screenshot: {
    width: 1920,
    height: 1080,
    fullPage: false,
    format: 'png',
    quality: 90,
    waitUntil: 'networkidle0',
    timeout: 30000,
  },

  // 水印配置：普通截图默认关闭；source=github 的请求默认开启，可通过请求参数覆盖
  watermark: {
    text: process.env.WATERMARK_TEXT || 'ezindie.com',
    position: process.env.WATERMARK_POSITION || 'bottom-right',
    opacity: parseFloat(process.env.WATERMARK_OPACITY) || 0.72,
  },
  
  // 安全配置
  security: {
    // URL 白名单（空数组表示不限制）
    allowedDomains: process.env.ALLOWED_DOMAINS 
      ? process.env.ALLOWED_DOMAINS.split(',')
      : [],
  },
  
  // GitHub API（可选，提高 README 接口限额）
  github: {
    token: process.env.GITHUB_TOKEN || '',
  },

  // 七牛云配置
  qiniu: {
    accessKey: process.env.QINIU_ACCESS_KEY || '',
    secretKey: process.env.QINIU_SECRET_KEY || '',
    bucket: process.env.QINIU_BUCKET || 'static',
    domain: process.env.QINIU_DOMAIN || '', // 自定义域名，如 https://cdn.example.com
    zone: process.env.QINIU_ZONE || 'Zone_z0', // 存储区域
    autoUpload: process.env.QINIU_AUTO_UPLOAD !== 'false', // 是否自动上传
    // 海外机房（如 Zeabur）建议开 CDN 上传域名，避免直连 up.qiniup.com 超时
    useCdnDomain: process.env.QINIU_USE_CDN_DOMAIN !== 'false',
    uploadTimeout: parseInt(process.env.QINIU_UPLOAD_TIMEOUT, 10) || 120000,
    uploadRetries: parseInt(process.env.QINIU_UPLOAD_RETRIES, 10) || 3,
  },
};
