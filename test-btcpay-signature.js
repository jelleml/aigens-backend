const crypto = require('crypto');

// Test payload from BTCPay (exact format as received)
const testPayload = `{
  "deliveryId": "VQSbbXS47ghMfwuHUBYm7E",
  "webhookId": "Y9QwZ5o88wxqnvdiJiFobd",
  "originalDeliveryId": "__test__4e0807cc-e730-4104-9cd2-cad2ab5a2049__test__",
  "isRedelivery": false,
  "type": "InvoiceCreated",
  "timestamp": 1754504984,
  "storeId": "4WnJDhQSfbgB9ygkuMpQZHb8m4fe2N5rQrp8hYdsCdkd",
  "invoiceId": "__test__6879a25b-26b0-4e20-b264-79bda759982c__test__",
  "metadata": null
}`;

// Test signature from BTCPay
const receivedSignature = '9795b759210411a5b8c85bc213827611c2e84c68a05a9c2510d5a654c5de8a90';

// Use the specific secret provided
const secret = "262MLecev9dPADYwpRV7jptKHGB7";

console.log('Testing BTCPay signature validation...');
console.log('Payload length:', testPayload.length);
console.log('Received signature:', receivedSignature);
console.log('Secret length:', secret.length);
console.log('Secret:', secret);

// Test different payload formats
console.log('\n--- Testing different payload formats ---');

// Format 1: Raw string (as received)
const rawPayload = testPayload;
const sig1 = crypto.createHmac('sha256', secret).update(rawPayload).digest('hex');
console.log('Raw string signature:', sig1);
console.log('Raw string matches:', sig1 === receivedSignature);

// Format 2: Compact JSON (no spaces)
const compactPayload = JSON.stringify(JSON.parse(testPayload));
const sig2 = crypto.createHmac('sha256', secret).update(compactPayload).digest('hex');
console.log('Compact JSON signature:', sig2);
console.log('Compact JSON matches:', sig2 === receivedSignature);

// Format 3: Pretty JSON (with spaces)
const prettyPayload = JSON.stringify(JSON.parse(testPayload), null, 2);
const sig3 = crypto.createHmac('sha256', secret).update(prettyPayload).digest('hex');
console.log('Pretty JSON signature:', sig3);
console.log('Pretty JSON matches:', sig3 === receivedSignature);

// Format 4: Raw buffer
const bufferPayload = Buffer.from(testPayload, 'utf8');
const sig4 = crypto.createHmac('sha256', secret).update(bufferPayload).digest('hex');
console.log('Buffer signature:', sig4);
console.log('Buffer matches:', sig4 === receivedSignature);

// Format 5: Trimmed payload (remove leading/trailing whitespace)
const trimmedPayload = testPayload.trim();
const sig5 = crypto.createHmac('sha256', secret).update(trimmedPayload).digest('hex');
console.log('Trimmed signature:', sig5);
console.log('Trimmed matches:', sig5 === receivedSignature);

console.log('\n--- Debug Info ---');
console.log('Raw payload first 50 chars:', testPayload.substring(0, 50));
console.log('Raw payload last 50 chars:', testPayload.substring(testPayload.length - 50));
console.log('Compact payload first 50 chars:', compactPayload.substring(0, 50));
console.log('Pretty payload first 50 chars:', prettyPayload.substring(0, 50));

// Test with a simple payload to verify our algorithm
console.log('\n--- Testing with simple payload ---');
const simplePayload = '{"test": "data"}';
const simpleSignature = crypto.createHmac('sha256', secret).update(simplePayload).digest('hex');
console.log('Simple payload:', simplePayload);
console.log('Simple signature:', simpleSignature);

// Test with BTCPay's example format
console.log('\n--- Testing BTCPay example format ---');
const btcpayExamplePayload = '{"invoiceId":"test","type":"InvoiceSettled"}';
const btcpayExampleSignature = crypto.createHmac('sha256', secret).update(btcpayExamplePayload).digest('hex');
console.log('BTCPay example payload:', btcpayExamplePayload);
console.log('BTCPay example signature:', btcpayExampleSignature); 