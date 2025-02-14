#import <Cordova/CDV.h>
#import <CoreNFC/CoreNFC.h>

@interface NfcPlugin : CDVPlugin <NFCTagReaderSessionDelegate>

- (void)hasNfc:(CDVInvokedUrlCommand*)command;
- (void)beginScanSession:(CDVInvokedUrlCommand*)command;
- (void)write:(CDVInvokedUrlCommand*)command;
- (void)endSession:(CDVInvokedUrlCommand*)command;

@end
