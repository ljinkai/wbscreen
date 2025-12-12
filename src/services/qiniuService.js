/**
 * 七牛云上传服务
 */
const qiniu = require('qiniu');
const config = require('../config/default');
const { AppError } = require('../utils/errorHandler');
const crypto = require('crypto');

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
  const deadline = Math.round(new Date().getTime() / 1000) + 3600; // 1小时有效期
  
  const options = {
    scope: config.qiniu.bucket,
    deadline,
  };
  
  const putPolicy = new qiniu.rs.PutPolicy(options);
  const uploadToken = putPolicy.uploadToken(mac);
  
  return uploadToken;
}

/**
 * 生成唯一文件名
 */
function generateFileName(format) {
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  const extension = format.toLowerCase() === 'jpeg' ? 'jpg' : 'png';
  return `screenshots/${timestamp}_${random}.${extension}`;
}

/**
 * 上传文件到七牛云
 */
async function uploadToQiniu(buffer, format) {
  try {
    // 生成上传 token
    const uploadToken = generateUploadToken();
    
    // 生成文件名
    const key = generateFileName(format);
    
    // 配置上传参数
    const qiniuConfig = new qiniu.conf.Config();
    // 设置存储区域
    if (config.qiniu.zone) {
      qiniuConfig.zone = qiniu.zone[config.qiniu.zone] || qiniu.zone.Zone_z0;
    }
    
    const formUploader = new qiniu.form_up.FormUploader(qiniuConfig);
    const putExtra = new qiniu.form_up.PutExtra();
    
    // 执行上传（使用 put 方法上传 buffer）
    return new Promise((resolve, reject) => {
      formUploader.put(uploadToken, key, buffer, putExtra, (err, body, info) => {
        if (err) {
          reject(new AppError(`上传到七牛云失败: ${err.message}`, 'QINIU_UPLOAD_ERROR', 500));
          return;
        }
        
        if (info.statusCode === 200) {
          // 构建完整的访问 URL
          const domain = config.qiniu.domain;
          let url;
          
          if (domain) {
            // 使用自定义域名
            url = domain.endsWith('/') 
              ? `${domain}${body.key}`
              : `${domain}/${body.key}`;
          } else {
            // 使用默认域名（需要根据实际区域调整）
            url = `https://${config.qiniu.bucket}.qiniucdn.com/${body.key}`;
          }
          
          resolve({
            key: body.key,
            url: url,
            hash: body.hash,
          });
        } else {
          reject(new AppError(`上传失败: ${info.statusCode}`, 'QINIU_UPLOAD_ERROR', 500));
        }
      });
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(`七牛云上传异常: ${error.message}`, 'QINIU_UPLOAD_ERROR', 500);
  }
}

module.exports = {
  uploadToQiniu,
  generateUploadToken,
};

