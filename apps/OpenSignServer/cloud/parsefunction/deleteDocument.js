export default async function deleteDocument(request) {
  const docId = request.params.docId;
  
  if (!docId) {
    return { error: 'Please provide documentId parameter!' };
  }

  const apiToken = request.headers?.['x-api-token'];
  const masterKey = process.env.MASTER_KEY;

  // 驗證 API Token
  if (!apiToken || apiToken !== masterKey) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Valid API token is required');
  }

  // 查找文檔
  const query = new Parse.Query('contracts_Document');
  query.equalTo('objectId', docId);
  query.notEqualTo('IsArchive', true); // 確保不是已刪除的文檔

  const document = await query.first({ useMasterKey: true });
  if (!document) {
    return { 
      success: true, 
      message: 'Document not found or already deleted!',
      documentId: docId 
    };
  }

  try {
    // 執行軟刪除 - 設定IsArchive為true
    document.set('IsArchive', true);

    await document.save(null, { useMasterKey: true });

    return { 
      success: true, 
      message: 'Document deleted successfully!',
      documentId: docId 
    };

  } catch (error) {
    console.log('Error in deleteDocument:', error);
    const code = error?.code || error?.response?.data?.code || 400;
    const message = error?.message || error?.response?.data?.error || 'Something went wrong';
    
    throw new Parse.Error(code, message);
  }
}