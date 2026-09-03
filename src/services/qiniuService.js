/**
 * 七牛云上传服务
 */
const qiniu = require('qiniu');
const config = require('../config/default');
const { AppError } = require('../utils/errorHandler');
const crypto = require('crypto');

/** 串行上传，降低 urllib「callback twice / socket hang up」概率 */
let uploadChain = Promise.resolve();

/**
 * 解析存储区域（与控制台 bucket 区域一致）
 */
function resolveQiniuZone() {
  const raw = (config.qiniu.zone || 'Zone_z0').trim();
  const map = {
    Zone_z0: qiniu.zone.Zone_z0,
    z0: qiniu.zone.Zone_z0,
    Zone_z1: qiniu.zone.Zone_z1,
    z1: qiniu.zone.Zone_z1,
    Zone_z2: qiniu.zone.Zone_z2,
    z2: qiniu.zone.Zone_z2,
    Zone_na0: qiniu.zone.Zone_na0,
    na0: qiniu.zone.Zone_na0,
    Zone_as0: qiniu.zone.Zone_as0,
    as0: qiniu.zone.Zone_as0,
  };
  return map[raw] || qiniu.zone.Zone_z0;
}

function buildQiniuConfig() {
  const qiniuConfig = new qiniu.conf.Config();
  qiniuConfig.zone = resolveQiniuZone();
  qiniuConfig.useHttpsDomain = true;
  const timeout = parseInt(process.env.QINIU_UPLOAD_TIMEOUT, 10);
  if (timeout > 0) {
    qiniuConfig.RPC_TIMEOUT = timeout;
  } else {
    qiniuConfig.RPC_TIMEOUT = 120000;
  }
  return qiniuConfig;
}

/**
 * 生成上传 Token
 */
function generateUploadToken() {
  const accessKey = config.qiniu.accessKey;
  const secretKey = config.qiniu.secretKey;

  if (!accessKey || !secretKey) {
    throw new AppError('七牛云配置不完整', 'QINIU_CONFIG_ERROR', 500);
  }

  const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
  const deadline = Math.round(new Date().getTime() / 1000) + 3600;

  const options = {
    scope: config.qiniu.bucket,
    deadline,
  };

  const putPolicy = new qiniu.rs.PutPolicy(options);
  return putPolicy.uploadToken(mac);
}

/**
 * 生成唯一文件名
 */
function generateFileName(format) {
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  const normalized = (format || 'png').toLowerCase();
  const extension =
    normalized === 'jpeg' || normalized === 'jpg'
      ? 'jpg'
      : normalized === 'gif'
        ? 'gif'
        : normalized === 'webp'
          ? 'webp'
          : 'png';
  return `screenshots/${timestamp}_${random}.${extension}`;
}

function normalizeDomain(domain) {
  if (!domain || typeof domain !== 'string') return '';
  const trimmed = domain.trim();
  // 去掉误写入环境变量的注释片段
  const withoutComment = trimmed.split(/\s+#/)[0].trim();
  return withoutComment.replace(/\/+$/, '');
}

function buildPublicUrl(key) {
  const domain = normalizeDomain(config.qiniu.domain);
  if (domain) {
    return domain.endsWith('/') ? `${domain}${key}` : `${domain}/${key}`;
  }
  return `https://${config.qiniu.bucket}.qiniucdn.com/${key}`;
}

function isRetryableUploadError(err) {
  const msg = (err && err.message) || String(err || '');
  return /socket hang up|ECONNRESET|ETIMEDOUT|Response timeout|callback twice/i.test(msg);
}

/**
 * 单次 put（Promise 只 settle 一次，避免 urllib 双回调）
 */
function putOnce(uploadToken, key, buffer, qiniuConfig) {
  const formUploader = new qiniu.form_up.FormUploader(qiniuConfig);
  const putExtra = new qiniu.form_up.PutExtra();

  return new Promise((resolve, reject) => {
    let settled = false;
    formUploader.put(uploadToken, key, buffer, putExtra, (err, body, info) => {
      if (settled) return;
      if (err) {
        settled = true;
        reject(err);
        return;
      }
      if (info && info.statusCode === 200 && body && body.key) {
        settled = true;
        resolve({
          key: body.key,
          url: buildPublicUrl(body.key),
          hash: body.hash,
        });
        return;
      }
      settled = true;
      reject(new Error(`上传失败: ${info?.statusCode ?? 'unknown'}`));
    });
  });
}

async function putWithRetry(uploadToken, key, buffer, qiniuConfig) {
  try {
    return await putOnce(uploadToken, key, buffer, qiniuConfig);
  } catch (firstErr) {
    if (!isRetryableUploadError(firstErr)) {
      throw firstErr;
    }
    console.warn('七牛上传失败，1s 后重试:', firstErr.message);
    await new Promise((r) => setTimeout(r, 1000));
    return await putOnce(uploadToken, key, buffer, qiniuConfig);
  }
}

/**
 * 上传文件到七牛云
 */
async function uploadToQiniu(buffer, format) {
  const run = async () => {
    try {
      const uploadToken = generateUploadToken();
      const key = generateFileName(format);
      const qiniuConfig = buildQiniuConfig();
      return await putWithRetry(uploadToken, key, buffer, qiniuConfig);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(`上传到七牛云失败: ${error.message}`, 'QINIU_UPLOAD_ERROR', 500);
    }
  };

  const next = uploadChain.then(run, run);
  uploadChain = next.catch(() => {});
  return next;
}

module.exports = {
  uploadToQiniu,
  generateUploadToken,
  resolveQiniuZone,
  buildPublicUrl,
};
