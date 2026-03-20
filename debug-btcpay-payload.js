const crypto = require('crypto');

// Secret from BTCPay Server
const secret = "262MLecev9dPADYwpRV7jptKHGB7";

// Real payload from BTCPay (exactly as received)
const realPayload = `{
  "deliveryId": "7oNoNyJ7p6xizvD3tQDeeL",
  "webhookId": "7tDTKeV1ShS2DMzXaPFNjV",
  "originalDeliveryId": "7oNoNyJ7p6xizvD3tQDeeL",
  "isRedelivery": false,
  "type": "InvoiceCreated",
  "timestamp": 1754505856,
  "storeId": "4WnJDhQSfbgB9ygkuMpQZHb8m4fe2N5rQrp8hYdsCdkd",
  "invoiceId": "BFPBa25W17Z2xDHyGs6bJJ",
  "metadata": {
    "userId": "5477eac6-2000-4991-a3c6-11d2951794ce",
    "creditAmount": 5000,
    "type": "credit_purchase",
    "transactionId": 4,
    "createdAt": 1754505853
  }
}`;

// Real signature from BTCPay
const realSignature = 'dccc1f27e85b91d7a7c51d997b2ba585e1e6317373dd64596ae645497c914c5d';

console.log('🔍 ADVANCED BTCPAY SIGNATURE DEBUG');
console.log('====================================');
console.log('Secret:', secret);
console.log('Secret length:', secret.length);
console.log('Real signature:', realSignature);
console.log('Payload length:', realPayload.length);

// Test 1: Raw payload (as received)
const sig1 = crypto.createHmac('sha256', secret).update(realPayload).digest('hex');
console.log('\n📊 TEST 1 - Raw payload:');
console.log('Calculated:', sig1);
console.log('Expected:  ', realSignature);
console.log('Match:     ', sig1 === realSignature ? '✅ YES' : '❌ NO');

// Test 2: Compact JSON
const compactPayload = JSON.stringify(JSON.parse(realPayload));
const sig2 = crypto.createHmac('sha256', secret).update(compactPayload).digest('hex');
console.log('\n📊 TEST 2 - Compact JSON:');
console.log('Calculated:', sig2);
console.log('Expected:  ', realSignature);
console.log('Match:     ', sig2 === realSignature ? '✅ YES' : '❌ NO');

// Test 3: Pretty JSON
const prettyPayload = JSON.stringify(JSON.parse(realPayload), null, 2);
const sig3 = crypto.createHmac('sha256', secret).update(prettyPayload).digest('hex');
console.log('\n📊 TEST 3 - Pretty JSON:');
console.log('Calculated:', sig3);
console.log('Expected:  ', realSignature);
console.log('Match:     ', sig3 === realSignature ? '✅ YES' : '❌ NO');

// Test 4: Buffer conversion
const bufferPayload = Buffer.from(realPayload, 'utf8');
const sig4 = crypto.createHmac('sha256', secret).update(bufferPayload).digest('hex');
console.log('\n📊 TEST 4 - Buffer conversion:');
console.log('Calculated:', sig4);
console.log('Expected:  ', realSignature);
console.log('Match:     ', sig4 === realSignature ? '✅ YES' : '❌ NO');

// Test 5: Different line endings
const unixPayload = realPayload.replace(/\r\n/g, '\n');
const sig5 = crypto.createHmac('sha256', secret).update(unixPayload).digest('hex');
console.log('\n📊 TEST 5 - Unix line endings:');
console.log('Calculated:', sig5);
console.log('Expected:  ', realSignature);
console.log('Match:     ', sig5 === realSignature ? '✅ YES' : '❌ NO');

// Test 6: Windows line endings
const windowsPayload = realPayload.replace(/\n/g, '\r\n');
const sig6 = crypto.createHmac('sha256', secret).update(windowsPayload).digest('hex');
console.log('\n📊 TEST 6 - Windows line endings:');
console.log('Calculated:', sig6);
console.log('Expected:  ', realSignature);
console.log('Match:     ', sig6 === realSignature ? '✅ YES' : '❌ NO');

// Test 7: Trimmed payload
const trimmedPayload = realPayload.trim();
const sig7 = crypto.createHmac('sha256', secret).update(trimmedPayload).digest('hex');
console.log('\n📊 TEST 7 - Trimmed payload:');
console.log('Calculated:', sig7);
console.log('Expected:  ', realSignature);
console.log('Match:     ', sig7 === realSignature ? '✅ YES' : '❌ NO');

// Test 8: Different secret formats
console.log('\n🔧 TESTING DIFFERENT SECRET FORMATS:');

// Test 8a: URL decoded
const urlDecodedSecret = decodeURIComponent(secret);
const sig8a = crypto.createHmac('sha256', urlDecodedSecret).update(realPayload).digest('hex');
console.log('URL decoded secret:', sig8a === realSignature ? '✅ MATCH' : '❌ NO MATCH');

// Test 8b: Base64 decoded
try {
    const base64DecodedSecret = Buffer.from(secret, 'base64').toString();
    const sig8b = crypto.createHmac('sha256', base64DecodedSecret).update(realPayload).digest('hex');
    console.log('Base64 decoded secret:', sig8b === realSignature ? '✅ MATCH' : '❌ NO MATCH');
} catch (e) {
    console.log('Base64 decoded secret: ❌ INVALID BASE64');
}

// Test 8c: Trimmed secret
const trimmedSecret = secret.trim();
const sig8c = crypto.createHmac('sha256', trimmedSecret).update(realPayload).digest('hex');
console.log('Trimmed secret:', sig8c === realSignature ? '✅ MATCH' : '❌ NO MATCH');

console.log('\n💡 DIAGNOSIS:');
console.log('If none of the tests match, the issue might be:');
console.log('1. The secret is wrong (most likely)');
console.log('2. BTCPay is using a different payload format');
console.log('3. BTCPay is using a different signature algorithm');
console.log('4. The payload has been modified in transit');

console.log('\n🎯 NEXT STEPS:');
console.log('1. Double-check the secret in BTCPay Server');
console.log('2. Try creating a new webhook with a new secret');
console.log('3. Check if BTCPay has any specific signature requirements');
console.log('4. Contact BTCPay support if needed'); 