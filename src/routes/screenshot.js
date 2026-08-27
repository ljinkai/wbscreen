/**
 * 截图路由
 */
const express = require('express');
const router = express.Router();
const screenshotService = require('../services/screenshotService');
const { validateScreenshotParams } = require('../utils/validator');

function mimeForFormat(format) {
  switch ((format || '').toLowerCase()) {
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/png';
  }
}

function withSource(payload, result) {
  return {
    ...payload,
    ...(result.source ? { source: result.source } : {}),
    ...(result.homepageUrl ? { homepageUrl: result.homepageUrl } : {}),
  };
}

/**
 * POST /api/screenshot
 * 截图接口（source=github 时优先 About 官网截图）
 */
router.post('/screenshot', async (req, res, next) => {
  try {
    const params = validateScreenshotParams(req.body);
    const result = await screenshotService.captureImage(params);

    const config = require('../config/default');
    const hasQiniuUpload = result.qiniu && config.qiniu.autoUpload;
    const hasQiniuConfig = config.qiniu.accessKey && config.qiniu.secretKey;

    if (params.returnBinary) {
      res.setHeader('Content-Type', mimeForFormat(result.format));
      res.setHeader('Content-Length', result.buffer.length);
      res.setHeader('Cache-Control', 'no-cache');
      if (result.source) {
        res.setHeader('X-Image-Source', result.source);
      }
      return res.send(result.buffer);
    }

    if (hasQiniuUpload) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache');
      return res.json(
        withSource(
          {
            success: true,
            format: result.format,
            url: result.qiniu.url,
            key: result.qiniu.key,
            hash: result.qiniu.hash,
            ...(params.returnBase64 && { base64: result.base64 }),
          },
          result
        )
      );
    }

    if (hasQiniuConfig && result.qiniuError) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache');
      return res.json(
        withSource(
          {
            success: true,
            format: result.format,
            warning: '七牛云上传失败，返回 base64',
            base64:
              result.base64 ||
              `data:${mimeForFormat(result.format)};base64,${result.buffer.toString('base64')}`,
            error: result.qiniuError,
          },
          result
        )
      );
    }

    if (params.returnBase64) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache');
      return res.json(
        withSource(
          {
            success: true,
            format: result.format,
            base64: result.base64,
          },
          result
        )
      );
    }

    if (hasQiniuConfig) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache');
      return res.json(
        withSource(
          {
            success: true,
            format: result.format,
            base64: `data:${mimeForFormat(result.format)};base64,${result.buffer.toString('base64')}`,
            note: '七牛云自动上传未启用，返回 base64 编码',
          },
          result
        )
      );
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');
    return res.json(
      withSource(
        {
          success: true,
          format: result.format,
          base64: `data:${mimeForFormat(result.format)};base64,${result.buffer.toString('base64')}`,
          note: '未配置七牛云，返回 base64 编码。如需二进制图片，请设置 returnBinary: true',
        },
        result
      )
    );
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/health
 * 健康检查接口
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
