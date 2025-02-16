const exec = require('cordova/exec');

const NFC = {
  /**
   * TNF constants
   */
  TNF_EMPTY: 0x00, // Empty record
  TNF_WELL_KNOWN: 0x01, // NFC Forum well-known type [NFC RTD]
  TNF_MEDIA: 0x02, // Media-type [RFC 2046]
  TNF_URI: 0x03, // Absolute URI [RFC 3986]
  TNF_EXTERNAL_TYPE: 0x04, // NFC Forum external type [NFC RTD]
  TNF_UNKNOWN: 0x05, // Unknown data
  TNF_UNCHANGED: 0x06, // Unchanged
  TNF_RESERVED: 0x07, // Reserved (do not use)

  /**
   * Use this method to set empty data for id or ndefData
   * in a NDEF record. 
   */
  unset: function () { 
    return new ArrayBuffer(0); 
  },

  /**
   * To check whether the device has NFC support.
   * 
   * Example usage:
   * 
   * cordova.plugins.NFC.hasNfc(
   * (enabledNfc) => {
   *   if(enabledNfc)
   *      console.log("Device has NFC enabled.");
   *   else 
   *      console.log("Device has NFC disabled.");
   * },
   * (error) => {
   *    console.log("Device has no NFC support: " + error);
   * });
   */
  hasNfc: function (success, error) {
    exec(success, error, 'NfcPlugin', 'hasNfc', []);
  },

  /**
   * Begins a read session for detectig a tag and NDEF.
   * 
   * Parameters:
   * 
   * success - the success calback with the scanned tag as single argument.
   * error - the error callback with the error as string as single argument.
   * alertMessage - optional string to be displayed on iOS NFC alert message.
   * 
   * Internally, it creates a read session in objective C 
   * (if a read or write session already exists it closes it and 
   * starts a new read one). The newly created session stays 
   * open for further writes after NDEF is read. Session is terminated
   * when 'cordova.plugins.NFC.endSession()' is called, or the session 
   * times out, or when the user cancels it in iOS.
   *  
   * When a tag is detected, the Objective C part extracts its 
   * serial number in the form 12:AB:FF:33:CD:D0:B2. Then,
   * it gets all NDEF records. Collected data is packed in an object
   * with following structure and passed to the success callback:
   * {
   *    tagSerial: string; // e.g. 12:AB:FF:33:CD:D0:B2
   *    ndefRecords: [
   *      {
   *        id: ArrayBuffer | null;
   *        tnf: number; // Integer represnting record TNF as in NFC spec.
   *        mimeType: string | null; // e.g. text/plain OR null
   *        ndefData: JSONArray; // array of unsigned integers for each NDEF data byte or empty for no data
   *      },
   *      ...
   *    ]
   * }
   * 
   * Example usage:
   * 
   * // 1. Read only example
   * cordova.plugins.NFC.beginScanSession(
   * (tag) => {
   *  console.log("TAG SERIAL: " + tag.tagSerial);
   * 
   *  for(const record of tag.ndefRecords) {
   *    if(record.mimeType)
   *      console.log("MIME: " + record.mimeType);
   *    
   *    console.log("TNF: " + record.tnf.toString());
   * 
   *    console.log("DATA SIZE: " + record.ndefData.length.toString());
   *  }
   * 
   *  // Explicit call of endSession to end the session
   *  cordova.plugins.NFC.endSession(() => { console.log("Session ended."); });
   * },
   * (error) => {
   *    console.log("Session closed or error reading tag: " + error);
   * },
   * "Hold your phone near an NFC tag.");
   * 
   * // 2. Read and write example
   * cordova.plugins.NFC.beginScanSession(
   * (tag) => {
   *  console.log("TAG SERIAL: " + tag.tagSerial);
   * 
   *  for(const record of tag.ndefRecords) {
   *    if(record.mimeType)
   *      console.log("MIME: " + record.mimeType);
   *    
   *    console.log("TNF: " + record.tnf.toString());
   * 
   *    console.log("DATA SIZE: " + record.ndefData.length.toString());
   *  }
   * 
   *  const text = "Hello world";
   *  const encoder = new TextEncoder();
   * 
   *  // The call to write will use the existing session to write the data
   *  // and then close the session
   *  cordova.plugins.NFC.write(
   *  [  
   *    {
   *      id: cordova.plugins.NFC.unset(),
   *      tnf: cordova.plugins.NFC.TNF_MEDIA,
   *      mimeType: "text/plain",
   *      ndefData: encoder.encode(text).buffer
   *    }, 
   *  ]
   *  () => {
   *    // Called on write success
   *    console.log("Write successful.");
   * 
   *    // The session will be closed here automatically in 
   *    // Objective C without calling the error handler.
   *  },
   *  (error) => {
   *    console.log("Session closed or error writing tag: " + error);
   *  },
   *  "Hold your phone near an NFC tag.",
   *  "Data has been successfully written.");
   * },
   * (error) => {
   *   console.log("Session closed or error reading tag: " + error);
   * },
   * "Hold your phone near an NFC tag.");
   */
  beginScanSession: function (success, error, alertMessage) {
    exec((tag) => {
      const transformedTag = { 
        tagSerial: tag.tagSerial,
        ndefRecords: []
      };
      for(const ndef of tag.ndefRecords) {
        transformedTag.ndefRecords.push({
          id: intArrayToArrayBuffer(ndef.id),
          tnf: ndef.tnf,
          mimeType: ndef.mimeType,
          ndefData: intArrayToArrayBuffer(ndef.ndefData)
        });
      }
      success(transformedTag);
    },
    error, 'NfcPlugin', 'beginScanSession', [alertMessage]);
  },

  /**
   * Writes NDEF records to a tag.
   * 
   * Parameters:
   * 
   * ndefRecords: Array - structure is:
   * [
   *   {
   *     id: ArrayBuffer | null - optional record identifier or null if not used.
   *     tnf: number
   *     mimeType: string | null - optional mime type as string (e.g. text/plain) or null if mime type is not needed
   *     ndefData: ArrayBuffer - the data to be written as Uint8ArrayBuffer.
   *   },
   *   ...
   * ]
   * 
   * success - called after successful write.
   * 
   * error - error callback called on premature session closed or write error.
   * 
   * alertMessage - Optional string to show on iOS NFC alert message.
   * ndefWrittenAlertMessage - Optional string to show on iOS NFC alert message when data has been written.
   * 
   * In Objective C, the function checks first wether we have an open session.
   * If this is the case, the session is used for the write.
   * 
   * If there is no pending session, a new write session is created. The write session
   * is terminated after write.
   * 
   * Example usage:
   * 
   *  const text = "Hello world";
   *  const encoder = new TextEncoder();
   * 
   *  // The call to write will use the existing read session to write the data
   *  // and then close the session
   *  cordova.plugins.NFC.write(
   *   [
   *     {
   *       id: cordova.plugins.NFC.unset(),
   *       tnf: cordova.plugins.NFC.TNF_MEDIA,
   *       mimeType: "text/plain",
   *       ndefData: encoder.encode(text).buffer
   *     }
   *   ], 
   *   () => {
   *     // Called on write success
   *     console.log("Write successful.");
   * 
   *     // The write session will be closed here automatically in 
   *     // Objective C without calling the error handler.
   *  },
   *  (error) => {
   *    console.log("Session closed or error writing tag: " + error);
   *  },
   *  "Hold your phone near an NFC tag.",
   *  "Data has been successfully written.");
   */
  write: function (ndefRecords, success, error, alertMessage, ndefWrittenAlertMessage) {
    const transformedRecords = [];
    for(const ndef of ndefRecords) {
      const record = {
        id: Array.from(new Uint8Array(ndef.id)),
        tnf: ndef.tnf,
        mimeType: ndef.mimeType,
        ndefData: Array.from(new Uint8Array(ndef.ndefData))
      }
      transformedRecords.push(record);
    }
    exec(success, error, 'NfcPlugin', 'write', [transformedRecords, alertMessage, ndefWrittenAlertMessage]);
  },

  /**
   * Terminate the session.
   * 
   * success - called if session is closed.
   * 
   * error - error callback for future use. Not called.
   */
  endSession: function (success, error) {
    exec(success, error, 'NfcPlugin', 'endSession', []);
  }
};

function intArrayToArrayBuffer(intArray) {
  const buffer = new ArrayBuffer(intArray.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < intArray.length; i++) {
    view[i] = intArray[i];
  }
  return buffer;
}

module.exports = NFC;
