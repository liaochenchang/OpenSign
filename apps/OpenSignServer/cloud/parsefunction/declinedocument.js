import axios from "axios";

export default async function declinedocument(request) {
  const docId = request.params.docId;
  const reason = request.params?.reason || '';
  const declineBy = {
    __type: 'Pointer',
    className: '_User',
    objectId: request.params?.userId,
  };

  if (!docId) {
    throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'missing parameter docId.');
  }
  try {
    const docCls = new Parse.Query('contracts_Document');
    docCls.include('ExtUserPtr.TenantId');
    const updateDoc = await docCls.get(docId, { useMasterKey: true });
    if (updateDoc) {
      const isEnableOTP = updateDoc?.get('IsEnableOTP') || false;
      if (!isEnableOTP) {
        updateDoc.set('IsDeclined', true);
        updateDoc.set('DeclineReason', reason);
        updateDoc.set('DeclineBy', declineBy);
        await updateDoc.save(null, { useMasterKey: true });
      } else {
        if (!request?.user) {
          throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'User is not authenticated.');
        }
        updateDoc.set('IsDeclined', true);
        updateDoc.set('DeclineReason', reason);
        updateDoc.set('DeclineBy', declineBy);
        await updateDoc.save(null, { useMasterKey: true });
      }

      const redirectUrl = updateDoc.get('CallbackUrl');
      if (redirectUrl && redirectUrl !== '') {
        const body = {
          isSigned: false,
          documentId: docId,
          reason: reason,
        };

        await axios.post(redirectUrl, body, {
          headers: { 'X-Parse-Master-Key': process.env.MASTER_KEY },
        });
      }

      return 'document declined';
    } else {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Document not found.');
    }
  } catch (err) {
    console.log('err while decling doc', err);
    throw err;
  }
}
