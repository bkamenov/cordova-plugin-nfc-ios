#import "NfcPlugin.h"
#import <CoreNFC/CoreNFC.h>

@interface NfcPlugin() {
    NSString* sessionCallbackId;
    id<NFCNDEFTag> connectedTag;
    NFCNDEFStatus connectedTagStatus;
}

@property (nonatomic, strong) NFCReaderSession *nfcSession;
@property (nonatomic, strong) NSString *alertMessage;
@property (nonatomic, strong) NSString *ndefWrittenAlertMessage;
@property (nonatomic, strong) NFCNDEFMessage *ndefMessageToWrite;
@property (nonatomic, assign) BOOL isWritingMode;
@property (strong, nonatomic) NFCNDEFMessage *messageToWrite;

@end

@implementation NfcPlugin

- (void)hasNfc:(CDVInvokedUrlCommand*)command {
    if (@available(iOS 14.0, *)) {
        BOOL nfcAvailable = [NFCNDEFReaderSession readingAvailable];
        CDVPluginResult* result = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsBool:nfcAvailable];
        [self.commandDelegate sendPluginResult:result callbackId:command.callbackId];
    } else {
        CDVPluginResult* result = [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsString:@"NFC requires iOS 14 or later"];
        [self.commandDelegate sendPluginResult:result callbackId:command.callbackId];
    }
}

- (void)beginScanSession:(CDVInvokedUrlCommand*)command {
    if (@available(iOS 14.0, *)) {
        self.alertMessage = [command.arguments objectAtIndex:0];
        self.isWritingMode = NO;

        if (!self.alertMessage || [self.alertMessage length] == 0) {
            self.alertMessage = @"Hold your phone near an NFC tag.";
        }
        
        sessionCallbackId = [command.callbackId copy];

        self.nfcSession = [[NFCTagReaderSession alloc]
                           initWithPollingOption:(NFCPollingISO14443 | NFCPollingISO15693)
                           delegate:self queue:dispatch_get_main_queue()];
        
        self.nfcSession.alertMessage = self.alertMessage;
        [self.nfcSession beginSession];

    } else {
        CDVPluginResult* result = [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsString:@"NFC requires iOS 14 or later"];
        [self.commandDelegate sendPluginResult:result callbackId:command.callbackId];
    }
}

- (void)write:(CDVInvokedUrlCommand*)command {
    if (@available(iOS 14.0, *)) {
        BOOL reusingSession = NO;
        self.isWritingMode = YES;
        
        NSArray<NSDictionary *> *ndefRecords = [command argumentAtIndex:0];
        self.alertMessage = [command.arguments objectAtIndex:1];
        self.ndefWrittenAlertMessage = [command.arguments objectAtIndex:2];
        NSMutableArray<NFCNDEFPayload*> *payloads = [NSMutableArray new];
        
        if (!self.alertMessage || [self.alertMessage length] == 0) {
            self.alertMessage = @"Hold your phone near an NFC tag.";
        }
        
        if (!self.ndefWrittenAlertMessage || [self.ndefWrittenAlertMessage length] == 0) {
            self.ndefWrittenAlertMessage = @"Data successfully written to NFC tag.";
        }
        
        @try {
            for (id recordData in ndefRecords) {
                NSNumber *tnfNumber = [recordData objectForKey:@"tnf"];
                NFCTypeNameFormat tnf = (uint8_t)[tnfNumber intValue];
                
                NSData *type = [self stringToNSData:[recordData objectForKey:@"mimeType"]];
                
                NSData *identifier = [self uint8ArrayToNSData:[recordData objectForKey:@"id"]];
                
                NSData *payload = [self uint8ArrayToNSData:[recordData objectForKey:@"ndefData"]];
                
                NFCNDEFPayload *record = [[NFCNDEFPayload alloc] initWithFormat:tnf type:type identifier:identifier payload:payload];
                [payloads addObject:record];
            }
   
            NFCNDEFMessage *message = [[NFCNDEFMessage alloc] initWithNDEFRecords:payloads];
            self.messageToWrite = message;
        } @catch(NSException *e) {
            CDVPluginResult *pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsString:@"Invalid NDEF Message provided."];
            [self.commandDelegate sendPluginResult:pluginResult callbackId:command.callbackId];
            return;
        }
        
        if (self.nfcSession && self.nfcSession.isReady) {
            reusingSession = YES;
        }
        else {
            self.nfcSession = [[NFCTagReaderSession alloc]
                       initWithPollingOption:(NFCPollingISO14443 | NFCPollingISO15693)
                       delegate:self queue:dispatch_get_main_queue()];
        }

        self.nfcSession.alertMessage = self.alertMessage;
        sessionCallbackId = [command.callbackId copy];

        if (reusingSession) {
            [self writeNdefTag:self.nfcSession status:connectedTagStatus tag:connectedTag];
        }
        else {
            [self.nfcSession beginSession];
        }
    }
}

- (void)endSession:(CDVInvokedUrlCommand*)command {
    [self closeSession];
    
    CDVPluginResult* result = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK];
    [self.commandDelegate sendPluginResult:result callbackId:command.callbackId];
}

#pragma mark - Internal implementation

- (void) sendError:(NSString *)message {
    if (sessionCallbackId) {
        NSLog(@"sendError: %@", message);
        CDVPluginResult *pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsString:message];
        [self.commandDelegate sendPluginResult:pluginResult callbackId:sessionCallbackId];
    }
}

- (void) closeSession {
    sessionCallbackId = NULL;
    connectedTag = NULL;
    connectedTagStatus = NFCNDEFStatusNotSupported;
    
    if (self.nfcSession) {
        [self.nfcSession invalidateSession];
        self.nfcSession = nil;
    }
}

- (void)handleNdefTag: (NFCReaderSession *)session tag:(__kindof id<NFCNDEFTag>)tag tagSerial: (NSString * _Nonnull)tagSerial {
                            
    [tag queryNDEFStatusWithCompletionHandler:^(NFCNDEFStatus status, NSUInteger capacity, NSError * _Nullable error) {
        if (error) {
            [self sendError:@"Error getting tag status."];
            [self closeSession];
            return;
        }
                
        if (self.isWritingMode) {
            [self writeNdefTag:session status:status tag:tag];
        } else {
            // save tag & status so we can re-use in potential write
            self->connectedTagStatus = status;
            self->connectedTag = tag;
            
            [self readNdefTag:session status:status tag:tag tagSerial:tagSerial];
        }
    }];
}

- (void)readNdefTag:(NFCReaderSession * _Nonnull)session status:(NFCNDEFStatus)status tag:(id<NFCNDEFTag>)tag tagSerial:(NSString * _Nonnull)tagSerial {
    if (status == NFCNDEFStatusNotSupported) {
        [self sendError:@"Tag does not support NDEF."];
        return;
    }
    
    [tag readNDEFWithCompletionHandler:^(NFCNDEFMessage * _Nullable message, NSError * _Nullable error) {
        // Error Code=403 "NDEF tag does not contain any NDEF message" is not an error for this plugin
        if (error && error.code != 403) {
            [self sendError:@"Read Failed."];
            [self closeSession];
            
            return;
        } 
        else {
            [self returnNdefTag:message tagSerial:tagSerial];
        }
    }];
}

-(void) returnNdefTag:(NFCNDEFMessage *) ndefMessage tagSerial:(NSString * _Nonnull)tagSerial {
    NSMutableDictionary *nfcMessage = [NSMutableDictionary new];
    nfcMessage[@"tagSerial"] = tagSerial;
    nfcMessage[@"ndefRecords"] = [NSMutableArray new];
    
    if(ndefMessage) {
        for(NFCNDEFPayload *record in ndefMessage.records) {
            NSMutableDictionary *nfcRecord = [NSMutableDictionary new];
            
            nfcRecord[@"id"] = [self uint8ArrayFromNSData: record.identifier];
            nfcRecord[@"tnf"] = [NSNumber numberWithInt:(int)record.typeNameFormat];
            nfcRecord[@"mimeType"] = [[NSString alloc] initWithData:record.type encoding:NSUTF8StringEncoding];
            nfcRecord[@"ndefData"] = [self uint8ArrayFromNSData: record.payload];
    
            [nfcMessage[@"ndefRecords"] addObject:[nfcRecord copy]];
        }
    }
    
    if (sessionCallbackId) {
        CDVPluginResult *pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsDictionary:nfcMessage];
        
        [self.commandDelegate sendPluginResult:pluginResult callbackId:sessionCallbackId];
        
        sessionCallbackId = NULL;
    }
}

- (void)writeNdefTag:(NFCReaderSession * _Nonnull)session status:(NFCNDEFStatus)status tag:(id<NFCNDEFTag>)tag {
    switch (status) {
        case NFCNDEFStatusNotSupported:
            [self sendError:@"Tag does not support NDEF."];
            [self closeSession];
            break;
            
        case NFCNDEFStatusReadOnly:
            [self sendError:@"Tag is read only."];
            [self closeSession];
            break;
            
        case NFCNDEFStatusReadWrite: {
            [tag writeNDEF: self.messageToWrite completionHandler:^(NSError * _Nullable error) {
                if (error) {
                    [self sendError:@"Write failed."];
                    [self closeSession];
                } else {
                    session.alertMessage = self.ndefWrittenAlertMessage;
                    CDVPluginResult *pluginResult = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK];
                    [self.commandDelegate sendPluginResult:pluginResult callbackId:self->sessionCallbackId];
                    [self closeSession];
                }
            }];
            break;
        }
            
        default: {
            [self sendError:@"Unknown NDEF tag status."];
            [self closeSession];
        }
    }
}

#pragma mark - helper methods

- (NSArray *) uint8ArrayFromNSData:(NSData *) data {
    const void *bytes = [data bytes];
    NSMutableArray *array = [NSMutableArray array];
    for (NSUInteger i = 0; i < [data length]; i += sizeof(uint8_t)) {
        uint8_t elem = OSReadLittleInt(bytes, i);
        [array addObject:[NSNumber numberWithInt:elem]];
    }
    return array;
}

- (NSData *) uint8ArrayToNSData:(NSArray *) array {
    NSMutableData *data = [[NSMutableData alloc] initWithCapacity: [array count]];
    for (NSNumber *number in array) {
        uint8_t b = (uint8_t)[number unsignedIntValue];
        [data appendBytes:&b length:1];
    }
    return data;
}

- (NSData *)stringToNSData:(NSString *)inputString {
    if (inputString == nil || inputString.length == 0) {
        return [NSData data]; // Return an empty NSData object
    }
    
    return [inputString dataUsingEncoding:NSUTF8StringEncoding];
}

#pragma mark - NFC session handlers

- (void)tagReaderSessionDidBecomeActive:(NFCTagReaderSession *)session {
    NSLog(@"NFC session is active. Ready to scan.");
}

- (void)tagReaderSession:(NFCTagReaderSession *)session didDetectTags:(NSArray<__kindof id<NFCTag>> *)tags {
    id<NFCTag> tag = [tags firstObject];
    NSString *tagSerial = [self getTagSerial:tag];
    id<NFCNDEFTag> ndefTag = (id<NFCNDEFTag>)tag;
    
    [session connectToTag:tag completionHandler:^(NSError * _Nullable error) {
        if (error) {
            [self sendError:@"Could not connect to tag."];
            return;
        }

        [self handleNdefTag:session tag:ndefTag tagSerial:tagSerial];
    }];
}

- (void)tagReaderSession:(nonnull NFCTagReaderSession *)session didInvalidateWithError:(nonnull NSError *)error {
    [self sendError:error.localizedDescription];
    [self closeSession];
}

#pragma mark - Tag Serial Retrieval

- (NSString *) getTagSerial:(id<NFCTag>)tag {
    NSData *uid;
    switch (tag.type) {
        case NFCTagTypeFeliCa:
            uid = [[tag asNFCFeliCaTag] currentIDm];
            break;
        case NFCTagTypeMiFare:
            uid = [[tag asNFCMiFareTag] identifier];
            break;
        case NFCTagTypeISO15693:
            uid = [[tag asNFCISO15693Tag] identifier];
            break;
        case NFCTagTypeISO7816Compatible:
            uid = [[tag asNFCISO7816Tag] identifier];
            break;
        default:
            uid = nil;
            break;
    }
    if(uid != nil)
        return [self hexStringFromData:uid];
    else
        return @"unknown";
}

- (NSString *)hexStringFromData:(NSData *)data {
    const unsigned char *dataBytes = (const unsigned char *)[data bytes];
    NSMutableString *hexString = [NSMutableString string];
    for (NSUInteger i = 0; i < data.length; i++) {
        [hexString appendFormat:@"%02X:", dataBytes[i]];
    }
    if ([hexString length] > 0) {
        [hexString deleteCharactersInRange:NSMakeRange([hexString length] - 1, 1)];
    }
    return hexString;
}

@end
