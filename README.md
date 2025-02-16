# cordova-plugin-nfc-ios

Cordova plugin to read/write NDEF messages on iOS.

## Installation:

For stable relases type:

```shell
cordova plugin add cordova-plugin-nfc-ios
```

With using specific NFC usage message:

```shell
cordova plugin add cordova-plugin-nfc-ios --variable NFC_USAGE_DESCRIPTION="Your custom NFC usage description."
```

For latest releases type:

```shell
cordova plugin add https://github.com/bkamenov/cordova-plugin-nfc-ios
```

With using specific NFC usage message:

```shell
cordova plugin add https://github.com/bkamenov/cordova-plugin-nfc-ios --variable NFC_USAGE_DESCRIPTION="Your custom NFC usage description."
```

## API & Usage:

```js
// NFC status checking
cordova.plugins.NFC.hasNfc(
(enabledNfc) => {
  if(enabledNfc)
     console.log("Device has NFC enabled.");
  else 
     console.log("Device has NFC disabled.");
},
(error) => {
   console.log("Device has no NFC support: " + error);
});
```

```js
// Read only example
cordova.plugins.NFC.beginScanSession(
  (tag) => {
    console.log("TAG SERIAL: " + tag.tagSerial);

    for(const record of tag.ndefRecords) {
      if(record.mimeType)
        console.log("MIME: " + record.mimeType);
    
      console.log("TNF: " + record.tnf.toString());

      console.log("DATA SIZE: " + record.ndefData.length.toString());
    }

    // Explicit call of endSession to end the session
    cordova.plugins.NFC.endSession(() => { console.log("Session ended."); });
  },
  (error) => {
    console.log("Session closed or error reading tag: " + error);
  },
  "Hold your phone near an NFC tag.");
```

```js
// Read and write example
cordova.plugins.NFC.beginScanSession(
  (tag) => {
    console.log("TAG SERIAL: " + tag.tagSerial);

    for(const record of tag.ndefRecords) {
      console.log("MIME: " + record.mimeType);
      console.log("TNF: " + record.tnf.toString());
      console.log("DATA SIZE: " + record.ndefData.length.toString());
      //record.id
    }

    const text = "Hello world";
    const encoder = new TextEncoder();

    // The call to write will use the existing session to write the data
    // and then close the session automatically
    cordova.plugins.NFC.write(
      [  
        {
          id: cordova.plugins.NFC.unset(),
          tnf: cordova.plugins.NFC.TNF_MEDIA,
          mimeType: "text/plain",
          ndefData: encoder.encode(text).buffer
        }, 
      ]
      () => {
        // Called on write success
        console.log("Write successful.");
      },
      (error) => {
        console.log("Session closed or error writing tag: " + error);
      },
      "Hold your phone near an NFC tag.",
      "Data has been successfully written.");
  },
  (error) => {
    console.log("Session closed or error reading tag: " + error);
  },
  "Hold your phone near an NFC tag.");
```

```js
// Write only example
const text = "Hello world";
const encoder = new TextEncoder();

// The call to write will create own session and when tag
// is detected will overwrite it.
cordova.plugins.NFC.write(
  [
    {
      id: cordova.plugins.NFC.unset(),
      tnf: cordova.plugins.NFC.TNF_MEDIA,
      mimeType: "text/plain",
      ndefData: encoder.encode(text).buffer
    }
  ], 
  () => {
    // Called on write success
    console.log("Write successful.");
  },
  (error) => {
    console.log("Session closed or error writing tag: " + error);
  },
  "Hold your phone near an NFC tag.",
  "Data has been successfully written.");
```

If you like my work and want more nice plugins, you can get me a [beer or stake](https://www.paypal.com/donate/?business=RXTV6JES35UQW&amount=5&no_recurring=0&item_name=Let+me+create+more+inspiring+Cordova+plugins.&currency_code=EUR).
