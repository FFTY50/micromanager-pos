#!/usr/bin/env node

/**
 * Test script to verify n8n webhook connection with real Verifone data
 */

const fetch = require('node-fetch');
require('dotenv').config();

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

if (!N8N_WEBHOOK_URL) {
  console.error('❌ N8N_WEBHOOK_URL not found in .env file');
  process.exit(1);
}

console.log('🔗 Testing n8n webhook connection...');
console.log('📡 URL:', N8N_WEBHOOK_URL);

// Test payload with real Verifone control sequences
const testPayload = {
  micromanager_id: 'mmd-rv1-test123',
  device_name: 'Test POS Terminal',
  pos_type: 'verifone_commander',
  raw_line: '\x1bc0\x01\x1b!\x0007/23/25 10:15:01 102 L  Monster Blue Hawaiia   1        3.49 \x0a',
  frigate_url: 'http://127.0.0.1:5000',
  timestamp: new Date().toISOString(),
  line_length: 85
};

async function testN8nConnection() {
  try {
    console.log('📤 Sending test payload...');
    console.log('📋 Payload:', JSON.stringify(testPayload, null, 2));
    
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SimplifiedMicromanager/test',
        'X-Device-ID': testPayload.micromanager_id,
        'X-Device-Name': testPayload.device_name,
        'X-POS-Type': testPayload.pos_type
      },
      body: JSON.stringify(testPayload)
    });

    console.log('📥 Response Status:', response.status, response.statusText);
    
    if (response.ok) {
      const responseText = await response.text();
      console.log('✅ SUCCESS! n8n webhook is working');
      console.log('📄 Response:', responseText || '(empty response)');
      
      // Verify control sequences were preserved
      if (testPayload.raw_line.includes('\x1bc0\x01\x1b!\x00')) {
        console.log('🎯 Control sequences preserved: \\x1bc0\\x01\\x1b!\\x00');
      }
      
      return true;
    } else {
      const errorText = await response.text();
      console.log('❌ FAILED! HTTP', response.status);
      console.log('📄 Error Response:', errorText);
      return false;
    }
    
  } catch (error) {
    console.log('❌ NETWORK ERROR:', error.message);
    console.log('🔍 Check your internet connection and n8n URL');
    return false;
  }
}

// Run the test
testN8nConnection().then(success => {
  if (success) {
    console.log('\n🎉 n8n webhook connection test PASSED!');
    console.log('🚀 Micromanager is ready to send raw POS data to n8n');
    process.exit(0);
  } else {
    console.log('\n💥 n8n webhook connection test FAILED!');
    console.log('🔧 Please check your N8N_WEBHOOK_URL in .env file');
    process.exit(1);
  }
});
