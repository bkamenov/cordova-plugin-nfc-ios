var exec = require('cordova/exec');

var NFC = {
  /**
   * To check whether the device has NFC support.
   * 
   * Example usage:
   * 
   * cordova.plugins.NFC.hasNfc(
   * () => {
   *   // If called, means has NFC support.
   *   console.log("Device has NFC support.");
   * },
   * () => {
   *    // If called error calback, means no NFC support.
   *    console.log("Device has no NFC support.");
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
   * keepSessionAfterRead - if true, the session is kept alive
   * for a NFC write until not terminated by user, timeout or explicit
   * call to cordova.plugins.NFC.endSession().
   * 
   * Internally, it creates a read session in objective C 
   * (if a read or write session already exists it closes it and 
   * starts a new read one). The newly created session stays 
   * open for further writes after NDEF is read if 'keepSessionAfterRead' 
   * is set to true. Session is automatically closed when NDEF is read and 
   * 'keepSessionAfterRead' was set to false. Session is terminated if
   * 'cordova.plugins.NFC.endSession()' is called, or the session times out,
   * or when the user cancels it in iOS.
   *  
   * When a tag is detected, the Objective C part extracts its 
   * serial number in the form 12:AB:FF:33:CD:D0:B2. Also,
   * if possible, it extracts the mime type as string (e.g. text/plain),
   * finally, gets the NDEF data as unsigned int array (each data byte is 
   * converted to unsigned int). Collected data is packed in a JSONObject
   * with following structure:
   * {
   *    tagSerial: string; // e.g. 12:AB:FF:33:CD:D0:B2
   *    mimeType: string | null; // e.g. text/plain OR null
   *    ndefData: JSONArray; // array of unsigned integers for each NDEF data byte or empty for no data
   * }
   * 
   * Example usage:
   * 
   * // 1. Read only example
   * cordova.plugins.NFC.beginReadSession(false,
   * (message) => {
   *  console.log("TAG SERIAL: " + message.tagSerial);
   * 
   *  if(message.mimeType)
   *    console.log("MIME: " + message.mimeType);
   * 
   *  console.log("DATA SIZE: " + message.ndefData.length.toString());
   * 
   *  // The session will be closed automatically in Objective C without 
   *  // invoking the error callback.
   * },
   * (error) => {
   *  if(error === "CANCELED")
   *    console.log("Session canceled by user from iOS or timed out.");
   *  else if(error === "ENDED")
   *    console.log("Session ended by a call to 'cordova.plugins.NFC.endSession()'");
   *  else
   *    console.log("Another error occurred: " + error);
   * });
   * 
   * // 2. Read and write example
   * cordova.plugins.NFC.beginReadSession(true,
   * (message) => {
   *  console.log("TAG SERIAL: " + message.tagSerial);
   * 
   *  if(message.mimeType)
   *    console.log("MIME: " + message.mimeType);
   * 
   *  console.log("DATA SIZE: " + message.ndefData.length.toString());
   * 
   *  const text = "Hello world";
   *  const encoder = new TextEncoder();
   * 
   *  // The call to write will use the existing read session to write the data
   *  // and then close the session
   *  cordova.plugins.NFC.write({
   *    mimeType: "text/plain",
   *    ndefData: encoder.encode(text).buffer
   *  }, 
   *  () => {
   *    // Called on write success
   *    console.log("Write successful.");
   * 
   *    // The read session will be invalidated here automatically in 
   *    // Objective C without calling the error handler.
   *  },
   *  (error) => {
   *    // During the nested write all session errors are transfered in the write error callback
   *    if(error === "CANCELED")
   *      console.log("Session canceled by user or timed out.");
   *    else if(error === "ENDED")
   *      console.log("Session ended by a call to 'cordova.plugins.NFC.endSession()'");
   *    else
   *      console.log("Another error occurred: " + error);
   *  });
   * },
   * (error) => {
   *  if(error === "CANCELED")
   *    console.log("Session canceled by user or timed out.");
   *  else if(error === "ENDED")
   *    console.log("Session ended by a call to 'cordova.plugins.NFC.endSession()'");
   *  else
   *    console.log("Another error occurred: " + error);
   * });
   */
  beginReadSession: function (keepSessionAfterRead, success, error) {
    exec((message) => {
      const transformedMessage = { ...message };
      transformedMessage.ndefData = intArrayToArrayBuffer(message.ndefData);
      success(transformedMessage);
    },
      error, 'NfcPlugin', 'beginReadSession', [keepSessionAfterRead ? 1 : 0]);
  },

  /**
   * Writes a NDEF message.
   * 
   * Parameters:
   * 
   * message: Object - structure is:
   * {
   *   mimeType: string | null - optional mime type as string (e.g. text/plain) or null if mime type is not needed
   *   ndefData: ArrayBuffer - the data to be written as Uint8ArrayBuffer.
   * }
   * 
   * In Objective C, the function checks first wether we have an open read session set with 
   * 'keepSessionAfterRead' to true. If this is the case, the read session is used for the write.
   * If there is a read session open with 'keepSessionAfterRead' set to false, or another 
   * write session, it is closed by implicit call to endSession() on the Objective C side
   * resulting in firing the appropriate error callbacks for session termination.
   * 
   * If there is no pending session, a new write session is created. The write session
   * is terminated after write, unsuccessful write, user cancel from iOS, or timeout.
   * 
   * Internally, the message.ndefData is delivered to Objective C as array of unsigned 
   * integers each representing a single data byte.
   * 
   * Example usage:
   * 
   *  const text = "Hello world";
   *  const encoder = new TextEncoder();
   * 
   *  // The call to write will use the existing read session to write the data
   *  // and then close the session
   *  cordova.plugins.NFC.write({
   *    mimeType: "text/plain",
   *    ndefData: encoder.encode(text).buffer
   *  }, 
   *  () => {
   *    // Called on write success
   *    console.log("Write successful.");
   * 
   *    // The write session will be invalidated here automatically in 
   *    // Objective C without calling the error handler.
   *  },
   *  (error) => {
   *    if(error === "CANCELED")
   *      console.log("Session canceled by user or timed out.");
   *    else if(error === "ENDED")
   *      console.log("Session ended by a call to 'cordova.plugins.NFC.endSession()'");
   *    else
   *      console.log("Another error occurred: " + error);
   *  });
   */
  write: function (message, success, error) {
    const transformedMessage = { ...message };
    transformedMessage.ndefData = Array.from(new Uint8Array(message.ndefData));
    exec(success, error, 'NfcPlugin', 'write', [transformedMessage]);
  },

  /**
   * Terminate any open read or write sessions.
   */
  endSession: function () {
    exec(null, null, 'NfcPlugin', 'endSession', []);
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
