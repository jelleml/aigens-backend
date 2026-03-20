const crypto = require('crypto');

// Real payload from BTCPay
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

// Current secret (probably wrong)
const currentSecret = "262MLecev9dPADYwpRV7jptKHGB7";

console.log('🔍 FINDING CORRECT BTCPAY SECRET');
console.log('================================');
console.log('Real payload length:', realPayload.length);
console.log('Real signature:', realSignature);
console.log('Current secret:', currentSecret);

// Test current secret
const currentSignature = crypto
    .createHmac('sha256', currentSecret)
    .update(realPayload)
    .digest('hex');

console.log('\n📊 RESULTS:');
console.log('Current signature:', currentSignature);
console.log('Signatures match:', currentSignature === realSignature);

// Test different payload formats
console.log('\n🧪 TESTING DIFFERENT FORMATS:');

// Format 1: Raw string (as received)
const sig1 = crypto.createHmac('sha256', currentSecret).update(realPayload).digest('hex');
console.log('Raw string:', sig1 === realSignature ? '✅ MATCH' : '❌ NO MATCH');

// Format 2: Compact JSON
const compactPayload = JSON.stringify(JSON.parse(realPayload));
const sig2 = crypto.createHmac('sha256', currentSecret).update(compactPayload).digest('hex');
console.log('Compact JSON:', sig2 === realSignature ? '✅ MATCH' : '❌ NO MATCH');

// Format 3: Pretty JSON
const prettyPayload = JSON.stringify(JSON.parse(realPayload), null, 2);
const sig3 = crypto.createHmac('sha256', currentSecret).update(prettyPayload).digest('hex');
console.log('Pretty JSON:', sig3 === realSignature ? '✅ MATCH' : '❌ NO MATCH');

console.log('\n💡 SOLUTION:');
console.log('The secret in your .env file is WRONG!');
console.log('You need to get the correct secret from your BTCPay Server:');
console.log('1. Go to your BTCPay Server');
console.log('2. Stores → Your Store → Webhooks');
console.log('3. Click "Edit" on the webhook');
console.log('4. Copy the "Webhook Secret"');
console.log('5. Update your .env file with the correct secret');
console.log('6. Restart your server');

// Test with some common BTCPay secrets (for debugging)
console.log('\n🔧 DEBUGGING:');
console.log('If you want to test, try these common patterns:');
console.log('- Check if the secret has leading/trailing spaces');
console.log('- Check if the secret is URL-encoded');
console.log('- Check if the secret is base64-encoded');
console.log('- Check if the secret is in a different format');

// Show what the signature should be with current secret
console.log('\n📋 DEBUG INFO:');
console.log('Expected signature with current secret:', currentSignature);
console.log('Real signature from BTCPay:', realSignature);
console.log('Difference:', currentSignature !== realSignature ? '❌ SECRET IS WRONG' : '✅ SECRET IS CORRECT'); 