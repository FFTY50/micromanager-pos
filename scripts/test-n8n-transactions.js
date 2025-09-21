#!/usr/bin/env node

/**
 * Test script to send multiple Verifone transactions to n8n
 * Tests the complete transaction parsing pipeline
 */

const fetch = require('node-fetch');
require('dotenv').config();

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

if (!N8N_WEBHOOK_URL) {
  console.error('❌ N8N_WEBHOOK_URL not found in .env file');
  process.exit(1);
}

// Import real Verifone transaction data
const VERIFONE_MOCK_TRANSACTIONS = [
    // Transaction 1: Convenience store items with cash payment
    [
        '\x1bc0\x01\x1b!\x0007/23/25 10:15:01 102 L  Monster Blue Hawaiia   1        3.49 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:15:03 102 L     PROPEL GRAPE 20oz   1        2.29 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:15:05 102           PREPAY CA #05   1       15.00 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:15:06 102                       TOTAL       20.78 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:15:15 102                        CASH       25.00 \x0a\x1bc0\x01\x1b!\x0007/23/25 10:15:15 102 ST#1                   DR#1 TRAN#1028401\x1bc0\x01\x1b!\x0007/23/25 10:15:15 102 CSH: CORPORATE         07/23/25 10:15:15\x0a'
    ],

    // Transaction 2: Tobacco purchase (high-tax items)
    [
        '\x1bc0\x01\x1b!\x0007/23/25 10:20:12 102 Trans#1028402 MANUAL ENTRY OVERRIDE\x1bc0\x01\x1b!\x0007/23/25 10:20:12 102 Sat Feb 02 00:00:00 EST 2002\x0a\x1bc0\x01\x1b!\x0007/23/25 10:20:12 102 H           NEWPORT BOX   1       10.19 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:20:14 102 H               TOBACCO   1        5.99 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:20:16 102                       TOTAL       16.18 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:20:25 102                       DEBIT       16.18 \x0a\x1bc0\x01\x1b!\x0007/23/25 10:20:25 102 ST#1                   DR#1 TRAN#1028402\x1bc0\x01\x1b!\x0007/23/25 10:20:25 102 CSH: CORPORATE         07/23/25 10:20:25\x0a'
    ],

    // Transaction 3: Snacks and drinks
    [
        '\x1bc0\x01\x1b!\x0007/23/25 10:25:30 102 L  Canada dry [591]ML 2   1        2.39 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:25:32 102 L  CANADA DRY GNGR ALE    1        2.29 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:25:34 102 L    SNICKERS KING SIZE   1        3.19 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:25:36 102                       TOTAL        7.87 \x0a',
        '\x1bc0\x01\x1b!\x0007/23/25 10:25:40 102                        CASH       10.00 \x0a\x1bc0\x01\x1b!\x0007/23/25 10:25:40 102 ST#1                   DR#1 TRAN#1028403\x1bc0\x01\x1b!\x0007/23/25 10:25:40 102 CSH: CORPORATE         07/23/25 10:25:40\x0a'
    ]
];

async function sendTransactionLine(rawLine, transactionId, lineNumber) {
  const payload = {
    micromanager_id: 'mmd-rv1-test123',
    device_name: 'camera_01',
    pos_type: 'verifone_commander',
    raw_line: rawLine,
    frigate_url: 'http://127.0.0.1:5000',
    timestamp: new Date().toISOString(),
    line_length: rawLine.length,
    test_metadata: {
      transaction_id: transactionId,
      line_number: lineNumber
    }
  };

  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SimplifiedMicromanager/test',
        'X-Device-ID': payload.micromanager_id,
        'X-Device-Name': payload.device_name,
        'X-POS-Type': payload.pos_type
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const responseText = await response.text();
      console.log(`✅ T${transactionId}L${lineNumber}: ${response.status} OK`);
      if (responseText && responseText.trim()) {
        console.log(`   📄 Response: ${responseText.substring(0, 100)}${responseText.length > 100 ? '...' : ''}`);
      }
      return { success: true, status: response.status };
    } else {
      const errorText = await response.text();
      console.log(`❌ T${transactionId}L${lineNumber}: HTTP ${response.status}`);
      console.log(`   📄 Error: ${errorText.substring(0, 200)}`);
      return { success: false, status: response.status, error: errorText };
    }
  } catch (error) {
    console.log(`💥 T${transactionId}L${lineNumber}: Network Error - ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testTransactions() {
  console.log('🧪 Testing n8n with 3 Verifone transactions...');
  console.log('📡 URL:', N8N_WEBHOOK_URL);
  console.log('🎯 Each transaction will be sent line by line\n');

  let totalLines = 0;
  let successfulLines = 0;
  let errors = [];

  for (let transactionIndex = 0; transactionIndex < 3; transactionIndex++) {
    const transaction = VERIFONE_MOCK_TRANSACTIONS[transactionIndex];
    const transactionId = transactionIndex + 1;
    
    console.log(`📦 Transaction ${transactionId}: ${transaction.length} lines`);
    
    for (let lineIndex = 0; lineIndex < transaction.length; lineIndex++) {
      const rawLine = transaction[lineIndex];
      const lineNumber = lineIndex + 1;
      
      totalLines++;
      
      // Show what we're sending (truncated for readability)
      const displayLine = rawLine.replace(/\x1b/g, '\\x1b').replace(/\x01/g, '\\x01').replace(/\x00/g, '\\x00').replace(/\x0a/g, '\\x0a');
      console.log(`   📤 Line ${lineNumber}: ${displayLine.substring(0, 80)}${displayLine.length > 80 ? '...' : ''}`);
      
      const result = await sendTransactionLine(rawLine, transactionId, lineNumber);
      
      if (result.success) {
        successfulLines++;
      } else {
        errors.push({
          transaction: transactionId,
          line: lineNumber,
          error: result.error || `HTTP ${result.status}`
        });
      }
      
      // Small delay between lines to simulate real POS timing
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`✅ Transaction ${transactionId} complete\n`);
    
    // Delay between transactions
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  console.log('📊 Test Summary:');
  console.log(`   📦 Transactions sent: 3`);
  console.log(`   📄 Total lines sent: ${totalLines}`);
  console.log(`   ✅ Successful: ${successfulLines}`);
  console.log(`   ❌ Failed: ${errors.length}`);
  
  if (errors.length > 0) {
    console.log('\n💥 Errors encountered:');
    errors.forEach(err => {
      console.log(`   T${err.transaction}L${err.line}: ${err.error}`);
    });
  }
  
  const successRate = ((successfulLines / totalLines) * 100).toFixed(1);
  console.log(`\n🎯 Success Rate: ${successRate}%`);
  
  if (successfulLines === totalLines) {
    console.log('🎉 ALL TRANSACTIONS SENT SUCCESSFULLY!');
    console.log('🚀 n8n parser is ready for production use');
    return true;
  } else {
    console.log('⚠️  Some transactions failed - check n8n workflow');
    return false;
  }
}

// Run the test
testTransactions().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('💥 Test failed:', error.message);
  process.exit(1);
});
