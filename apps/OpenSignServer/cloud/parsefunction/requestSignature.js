import axios from 'axios';
import { cloudServerUrl, mailTemplate, replaceMailVaribles, serverAppId } from '../../Utils.js';

const serverUrl = cloudServerUrl;
const appId = serverAppId;

/**
 * 請求簽署的API函數
 * 此函數允許用戶上傳文件並發送簽署請求給指定的簽署者
 */

// 發送郵件通知簽署者
async function sendSignatureRequestEmail(document, signers, publicUrl) {
  const baseUrl = new URL(publicUrl);
  const timeToCompleteDays = document?.TimeToCompleteDays || 15;
  const ExpireDate = new Date(document.createdAt);
  ExpireDate.setDate(ExpireDate.getDate() + timeToCompleteDays);
  
  const localExpireDate = ExpireDate.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const senderName = document.ExtUserPtr.Name;
  const senderEmail = document.ExtUserPtr.Email;
  const orgName = document.ExtUserPtr.Company || '';

  // 如果啟用按順序簽署，只發送給第一個簽署者
  let signersToNotify = document.SendinOrder ? [signers[0]] : signers;

  for (let i = 0; i < signersToNotify.length; i++) {
    try {
      const signer = signersToNotify[i];
      const url = `${serverUrl}/functions/sendmailv3`;
      const headers = { 'Content-Type': 'application/json', 'X-Parse-Application-Id': appId };
      
      // 創建簽署連結
      const encodeBase64 = btoa(`${document.objectId}/${signer.email}/${signer.objectId || ''}`);
      const signPdf = `${baseUrl.origin}/login/${encodeBase64}`;

      // 準備郵件變數
      const variables = {
        document_title: document?.Name,
        note: document?.Note || '',
        sender_name: senderName,
        sender_mail: senderEmail,
        sender_phone: document.ExtUserPtr?.Phone || '',
        receiver_name: signer.name || '',
        receiver_email: signer.email,
        receiver_phone: signer.phone || '',
        expiry_date: localExpireDate,
        company_name: orgName,
        signing_url: signPdf,
      };

      // 準備郵件參數
      const mailparam = {
        note: document?.Note || '',
        senderName: senderName,
        senderMail: senderEmail,
        title: document.Name,
        organization: orgName,
        localExpireDate: localExpireDate,
        signingUrl: signPdf,
      };

      // 使用自定義郵件模板或預設模板
      const mailBody = document?.ExtUserPtr?.TenantId?.RequestBody || '';
      const mailSubject = document?.ExtUserPtr?.TenantId?.RequestSubject || '';
      
      let replaceVar;
      if (mailBody && mailSubject) {
        const replacedRequestBody = mailBody.replace(/"/g, "'");
        const htmlReqBody = `<html><head><meta http-equiv='Content-Type' content='text/html; charset=UTF-8' /></head><body>${replacedRequestBody}</body></html>`;
        replaceVar = replaceMailVaribles(mailSubject, htmlReqBody, variables);
      }

      const params = {
        extUserId: document.ExtUserPtr.objectId,
        recipient: signer.email,
        subject: replaceVar?.subject || mailTemplate(mailparam).subject,
        from: senderEmail,
        replyto: senderEmail,
        html: replaceVar?.body || mailTemplate(mailparam).body,
      };

      await axios.post(url, params, { headers });
      console.log(`Signature request email sent to: ${signer.email}`);
    } catch (error) {
      console.error(`Failed to send email to ${signersToNotify[i].email}:`, error);
    }
  }
}

// 更新用戶文件計數
async function updateDocumentCount(extUserId, count = 1) {
  try {
    const extCls = new Parse.Object('contracts_Users');
    extCls.id = extUserId;
    extCls.increment('DocumentCount', count);
    await extCls.save(null, { useMasterKey: true });
  } catch (err) {
    console.log('Error updating document count:', err);
  }
}

// 主要的API函數
export default async function requestSignature(request) {
  const {
    fileUrl,
    fileName,
    description,
    note,
    signers,
    timeToCompleteDays = 15,
    sendInOrder = true,
    automaticReminders = false,
    remindOnceInEvery = 5,
    isEnableOTP = false,
    isTourEnabled = false,
    allowModifications = false,
    bcc = [],
    redirectUrl
  } = request.params;

  const apiToken = request.headers?.['x-api-token'];
  const publicUrl = process.env.PUBLIC_URL;
  const originIp = request?.headers?.['x-real-ip'] || '';
  const masterKey = process.env.MASTER_KEY;

  if (!fileUrl) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'File URL is required');
  }

  if (!fileName) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'File name is required');
  }

  if (!signers || !Array.isArray(signers) || signers.length === 0) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'At least one signer is required');
  }

  // 驗證簽署者格式
  for (const signer of signers) {
    if (!signer.email) {
      throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Each signer must have an email address');
    }
    if (!signer.name) {
      throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Each signer must have a name');
    }
  }

  // 驗證 API Token
  if (!apiToken || apiToken !== masterKey) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Valid API token is required');
  }

  try {
    const organizationQuery = new Parse.Query('contracts_Organizations');
    organizationQuery.equalTo('IsActive', true);
    const organization = await organizationQuery.first({ useMasterKey: true });

    if (!organization) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Organization not found');
    }

    const adminContractsUserQuery = new Parse.Query('contracts_Users');
    adminContractsUserQuery.equalTo('UserRole', 'contracts_Admin');
    adminContractsUserQuery.include('TenantId');
    adminContractsUserQuery.include('UserId');

    const adminContractsUser = await adminContractsUserQuery.first({ useMasterKey: true });

    if (!adminContractsUser) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Admin user not found');
    }

    const adminUser = adminContractsUser.get('UserId');
    const partnersTenant = adminContractsUser.get('TenantId');

    const userList = [];
    const placeholders = [];

    // 準備聯絡人（如果不存在則創建）
    const contactPromises = signers.map(async (signer) => {
      // 查找現有聯絡人（使用系統用戶或指定用戶）
      const contactQuery = new Parse.Query('contracts_Contactbook');
      contactQuery.equalTo('Email', signer.email);
      contactQuery.equalTo('CreatedBy', adminUser);
      
      let contact = await contactQuery.first({ useMasterKey: true });
      
      if (!contact) {
        // 創建新聯絡人
        const contactObject = new Parse.Object('contracts_Contactbook');
        contactObject.set('Name', signer.name);
        contactObject.set('Email', signer.email);
        contactObject.set('UserRole', 'contracts_Guest');
        contactObject.set('IsDeleted', false);
        contactObject.set('TenantId', {
          __type: 'Pointer',
          className: 'partners_Tenant',
          objectId: partnersTenant,
        });

        const userQuery = new Parse.Query('_User');
        userQuery.equalTo('username', signer.email);
        let user = await userQuery.first({ useMasterKey: true });

        if (!user) {
          const userObject = new Parse.Object('_User');
          userObject.set('name', signer.name);
          userObject.set('username', signer.email);
          userObject.set('password', masterKey);
          userObject.set('email', signer.email);
          user = await userObject.save({ useMasterKey: true });
        }

        userList.push(user);

        contactObject.set('CreatedBy', adminUser);
        contactObject.set('UserId', user);
        const acl = new Parse.ACL();
        acl.setReadAccess(user.id, true);
        acl.setWriteAccess(user.id, true);
        acl.setReadAccess(adminUser.id, true);
        acl.setWriteAccess(adminUser.id, true);
        contactObject.setACL(acl);

        contact = await contactObject.save(null, { useMasterKey: true });
      }

      const placeholder = {
        Id: randomId(),
        blockColor: '#93a3db',
        signerPtr: {
          __type: 'Pointer',
          className: 'contracts_Contactbook',
          objectId: contact.id,
        },
        signerObjId: contact.id,
        placeHolder: signer.widgets.map(widget => {
          return {
            pageNumber: widget.page,
            pos: [
              {
                xPosition: widget.x,
                yPosition: widget.y,
                isStamp: false,
                key: randomId(),
                scale: 1.4412416609345955,
                zIndex: 2,
                type: widget.type,
                options: {
                  status: 'required',
                  name: 'Signature'
                },
                Width: widget.w,
                Height: widget.h
              }
            ]
          }
        })
      }

      placeholders.push(placeholder);
      return contact;
    });

    const contacts = await Promise.all(contactPromises);

    // 準備文件數據
    const currentDate = new Date();
    let expiryDate = new Date();
    expiryDate.setDate(currentDate.getDate() + parseInt(timeToCompleteDays));
    const documentObject = new Parse.Object('contracts_Document');
    documentObject.set('Name', fileName || 'Document');
    documentObject.set('Description', description || '');
    documentObject.set('URL', fileUrl);
    documentObject.set('Note', note || 'Please review and sign this document');
    documentObject.set('SendinOrder', sendInOrder);
    documentObject.set('AutomaticReminders', automaticReminders);
    documentObject.set('RemindOnceInEvery', parseInt(remindOnceInEvery));
    documentObject.set('IsTourEnabled', isTourEnabled);
    documentObject.set('TimeToCompleteDays', parseInt(timeToCompleteDays));
    documentObject.set('AllowModifications', allowModifications);
    documentObject.set('IsEnableOTP', isEnableOTP);
    documentObject.set('NotifyOnSignatures', true);
    documentObject.set('CreatedBy', adminUser);
    documentObject.set('ExpiryDate', expiryDate);
    documentObject.set('OriginIp', originIp);
    documentObject.set('SentToOthers', true);
    documentObject.set('DocSentAt', currentDate);
    documentObject.set('Placeholders', placeholders);
    documentObject.set('SignatureType', [
      {
        name: 'draw',
        enabled: true
      },
      {
        name: 'typed',
        enabled: false
      },
      {
        name: 'upload',
        enabled: true
      },
      {
        name: 'default',
        enabled: true
      },
    ]);
    documentObject.set('Signers', contacts.map(contact => contact.toPointer()));
    documentObject.set('SignedUrl', fileUrl);
    documentObject.set('ExtUserPtr', adminContractsUser);

    const documentAcl = new Parse.ACL();
    userList.forEach(user => {
      documentAcl.setReadAccess(user.id, true);
      documentAcl.setWriteAccess(user.id, true);
    });
    documentAcl.setReadAccess(adminUser.id, true);
    documentAcl.setWriteAccess(adminUser.id, true);
    documentObject.setACL(documentAcl);
    const savedDocument = await documentObject.save(null, { useMasterKey: true });

    // 更新文件計數
    await updateDocumentCount(adminContractsUser.id, 1);

    // 為每個簽署者生成個別的簽署連結
    const signingLinks = contacts.map(contact => {
      const encodeBase64 = Buffer.from(`${savedDocument.id}/${contact.get('Email')}/${contact.id}`).toString('base64');

      return {
        signerEmail: contact.get('Email'),
        signerName: contact.get('Name'),
        signingUrl: `${publicUrl}/login/${encodeBase64}`,
      };
    });

    return {
      success: true,
      documentId: savedDocument.id,
      message: 'Signature request sent successfully',
      signingLinks: signingLinks,
    };

  } catch (error) {
    console.error('Error in requestSignature:', error);
    
    const code = error?.code || error?.response?.data?.code || 400;
    const message = error?.message || error?.response?.data?.error || 'Something went wrong';
    
    throw new Parse.Error(code, message);
  }
}

export const randomId = () => {
  // 1. Grab a cryptographically-secure 32-bit random value
  const randomBytes = crypto.getRandomValues(new Uint32Array(1));
  const raw = randomBytes[0]; // 0 … 4 294 967 295

  // 2. Collapse into a 90 000 000-wide band (0…89 999 999), then shift to 10 000 000…99 999 999
  const eightDigit = 10_000_000 + (raw % 90_000_000);

  return eightDigit;
};