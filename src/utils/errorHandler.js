/**
 * 错误处理工具
 */

class AppError extends Error {
  constructor(message, code, statusCode = 500) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

/**
 * 统一错误响应格式
 */
function errorResponse(error, req, res, next) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: true,
      message: error.message,
      code: error.code,
    });
  }
  
  // 处理 Puppeteer 相关错误
  if (error.message && error.message.includes('Navigation timeout')) {
    return res.status(408).json({
      error: true,
      message: '请求超时，请稍后重试',
      code: 'TIMEOUT_ERROR',
    });
  }
  
  if (error.message && error.message.includes('net::ERR')) {
    return res.status(400).json({
      error: true,
      message: '无法访问目标网页，请检查 URL 是否正确',
      code: 'NETWORK_ERROR',
    });
  }
  
  // 默认错误
  console.error('Unhandled error:', error);
  return res.status(500).json({
    error: true,
    message: error.message || '服务器内部错误',
    code: 'INTERNAL_ERROR',
  });
}

/**
 * 404 处理
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: true,
    message: '接口不存在',
    code: 'NOT_FOUND',
  });
}

module.exports = {
  AppError,
  errorResponse,
  notFoundHandler,
};

