import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import docxtopdf, { upload as docxUpload } from './docxtopdf.js';
import decryptpdf, { upload as decryptUpload } from './decryptpdf.js';
import multer from 'multer';
import multerS3 from 'multer-s3';
import aws from 'aws-sdk';
import { useLocal, serverAppId } from '../../Utils.js';
import { getSignedLocalUrl } from '../parsefunction/getSignedUrl.js';

export const app = express();

dotenv.config();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Helper function to setup file storage for request-signature
function setupFileStorage() {
  function sanitizeFileName(fileName) {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, '');
  }

  const size = 100 * 1024 * 1024; // 100MB
  const accepted_extensions = ['pdf'];

  const DO_ENDPOINT = process.env.DO_ENDPOINT;
  const DO_ACCESS_KEY_ID = process.env.DO_ACCESS_KEY_ID;
  const DO_SECRET_ACCESS_KEY = process.env.DO_SECRET_ACCESS_KEY;
  const DO_SPACE = process.env.DO_SPACE;

  let fileStorage;
  if (useLocal === 'true') {
    fileStorage = multer.diskStorage({
      destination: function (req, file, cb) {
        // 保存到 Parse Server 期望的路徑
        const dest = `files/${serverAppId}`;
        // 確保目錄存在
        const fs = require('fs');
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(dest, { recursive: true });
        }
        cb(null, dest);
      },
      metadata: function (req, file, cb) {
        cb(null, { fieldName: 'OPENSIGN_METADATA' });
      },
      filename: function (req, file, cb) {
        let filename = file.originalname;
        let newFileName = filename.split('.')[0];
        let extension = filename.split('.')[1];
        newFileName = sanitizeFileName(
          newFileName + '_' + new Date().toISOString() + '.' + extension
        );
        cb(null, newFileName);
      },
    });
  } else {
    try {
      const spacesEndpoint = new aws.Endpoint(DO_ENDPOINT);
      const s3 = new aws.S3({
        endpoint: spacesEndpoint,
        accessKeyId: DO_ACCESS_KEY_ID,
        secretAccessKey: DO_SECRET_ACCESS_KEY,
        signatureVersion: 'v4',
        region: process.env.DO_REGION,
      });
      fileStorage = multerS3({
        acl: 'public-read',
        s3,
        bucket: DO_SPACE,
        metadata: function (req, file, cb) {
          cb(null, { fieldName: 'OPENSIGN_METADATA' });
        },
        key: function (req, file, cb) {
          let filename = file.originalname;
          let newFileName = filename.split('.')[0];
          let extension = filename.split('.')[1];
          newFileName = sanitizeFileName(
            newFileName + '_' + new Date().toISOString() + '.' + extension
          );
          cb(null, newFileName);
        },
      });
    } catch (err) {
      fileStorage = multer.diskStorage({
        destination: function (req, file, cb) {
          // 保存到 Parse Server 期望的路徑
          const dest = `files/${serverAppId}`;
          // 確保目錄存在
          const fs = require('fs');
          if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
          }
          cb(null, dest);
        },
        metadata: function (req, file, cb) {
          cb(null, { fieldName: 'OPENSIGN_METADATA' });
        },
        filename: function (req, file, cb) {
          let filename = file.originalname;
          let newFileName = filename.split('.')[0];
          let extension = filename.split('.')[1];
          newFileName = sanitizeFileName(
            newFileName + '_' + new Date().toISOString() + '.' + extension
          );
          cb(null, newFileName);
        },
      });
    }
  }

  return multer({
    fileFilter: function (req, file, cb) {
      if (accepted_extensions.some(ext => file.originalname.toLowerCase().endsWith('.' + ext))) {
        return cb(null, true);
      }
      return cb('Only ' + accepted_extensions.join(', ') + ' files are allowed!');
    },
    storage: fileStorage,
    limits: { fileSize: size },
  });
}

app.post('/docxtopdf', docxUpload.single('file'), docxtopdf);
app.post('/decryptpdf', decryptUpload.single('file'), decryptpdf);
// 設置文件上傳中間件
const upload = setupFileStorage();

// 新增直接文件簽署請求的API端點 - 支持文件上傳和base64編碼
app.post('/v1/request-signature', upload.single('file'), async (req, res) => {
  try {
    const { cloudServerUrl, serverAppId } = await import('../../Utils.js');
    
    let requestParams = {};
    
    // 檢查是否為multipart/form-data請求（文件上傳）
    if (req.file) {
      // 處理文件上傳
      let fileUrl;
      if (useLocal === 'true') {
        // 使用正確的 PUBLIC_URL 格式
        const publicUrl = process.env.PUBLIC_URL || 'https://localhost:3001';
        const baseFileUrl = `${publicUrl}/api/app/files/${serverAppId}/${req.file.filename}`;
        // 添加JWT簽名
        fileUrl = getSignedLocalUrl(baseFileUrl);
      } else {
        fileUrl = req.file.location;
      }
      
      // 從form-data中獲取其他參數
      requestParams = {
        fileUrl: fileUrl,
        fileName: req.file.originalname,
        documentTitle: req.body.documentTitle || req.file.originalname,
        description: req.body.description,
        note: req.body.note,
        signers: req.body.signers ? JSON.parse(req.body.signers) : [],
        widgets: req.body.widgets ? JSON.parse(req.body.widgets) : null,
        timeToCompleteDays: req.body.timeToCompleteDays ? parseInt(req.body.timeToCompleteDays) : 15,
        sendInOrder: req.body.sendInOrder !== 'false',
        automaticReminders: req.body.automaticReminders === 'true',
        remindOnceInEvery: req.body.remindOnceInEvery ? parseInt(req.body.remindOnceInEvery) : 5,
        isEnableOTP: req.body.isEnableOTP === 'true',
        isTourEnabled: req.body.isTourEnabled === 'true',
        allowModifications: req.body.allowModifications === 'true',
        bcc: req.body.bcc ? JSON.parse(req.body.bcc) : [],
        redirectUrl: req.body.redirectUrl,
        userEmail: req.body.userEmail
      };
    } else if (req.body && req.body.fileBase64) {
      // 處理base64編碼的文件（類似OpenSign Labs API）
      const fs = await import('fs');
      const path = await import('path');
      
      // 解碼base64文件
      const fileBuffer = Buffer.from(req.body.fileBase64, 'base64');
      const fileName = req.body.fileName || 'document.pdf';
      const timestamp = Date.now();
      const sanitizedFileName = timestamp + '_' + fileName;
      
      let fileUrl;
      if (useLocal === 'true') {
        // 本地存儲 - 保存到 Parse Server 期望的路徑
        const filePath = path.join('files/files', sanitizedFileName);
        // 確保目錄存在
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, fileBuffer);
        // 使用正確的 PUBLIC_URL 格式
        const publicUrl = process.env.PUBLIC_URL || 'https://localhost:3001';
        const baseFileUrl = `${publicUrl}/api/app/files/${serverAppId}/${sanitizedFileName}`;
        // 添加JWT簽名
        fileUrl = getSignedLocalUrl(baseFileUrl);
      } else {
        // S3存儲
        const aws = await import('aws-sdk');
        const spacesEndpoint = new aws.Endpoint(process.env.DO_ENDPOINT);
        const s3 = new aws.S3({
          endpoint: spacesEndpoint,
          accessKeyId: process.env.DO_ACCESS_KEY_ID,
          secretAccessKey: process.env.DO_SECRET_ACCESS_KEY,
          signatureVersion: 'v4',
          region: process.env.DO_REGION,
        });
        
        const uploadResult = await s3.upload({
          Bucket: process.env.DO_SPACE,
          Key: sanitizedFileName,
          Body: fileBuffer,
          ACL: 'public-read',
          ContentType: 'application/pdf'
        }).promise();
        
        fileUrl = uploadResult.Location;
      }
      
      requestParams = {
        ...req.body,
        fileUrl: fileUrl,
        fileName: fileName
      };
      delete requestParams.fileBase64; // 移除base64數據
    } else {
      // 使用現有的fileUrl參數（向後兼容）
      requestParams = req.body;
    }

    // 動態導入函數
    const { default: requestSignature } = await import('../parsefunction/requestSignature.js');
    
    // 構建請求對象，模擬Parse Server的請求格式
    const request = {
      params: requestParams,
      headers: req.headers,
      user: req.user
    };

    const result = await requestSignature(request);
    res.status(200).json(result);
  } catch (error) {
    console.error('API Error:', error);
    res.status(error.code || 400).json({
      error: error.message || 'Something went wrong'
    });
  }
});
