#!/usr/bin/env node

/**
 * Mock Serial Data Generator
 * Simulates POS transaction data for testing without actual hardware
 * Usage: node scripts/mock-serial-data.js [pos_type] [interval_ms]
 */

const EventEmitter = require('events');
const fs = require('fs');
const { getRandomVerifoneTransaction, generateVerifoneTransactionWithTimestamp } = require('../tests/mocks/verifone-mock-data');

class MockSerialDataGenerator extends EventEmitter {
    constructor(posType = 'verifone_commander', intervalMs = 2000) {
        super();
        this.posType = posType;
        this.intervalMs = intervalMs;
        this.isRunning = false;
        this.transactionCounter = 1;
        
        // Load transaction templates
        this.templates = this.loadTransactionTemplates();
    }

    loadTransactionTemplates() {
        // Only Verifone Commander is supported with authentic field data
        // Sam4s support removed until real data is available
        return {
            verifone_commander: 'AUTHENTIC_DATA' // Marker to use real data from verifone-mock-data.js
        };
    }

    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        console.log(`🎭 Starting mock serial data generator for ${this.posType}`);
        console.log(`📡 Sending transactions every ${this.intervalMs}ms`);
        console.log('🛑 Press Ctrl+C to stop\n');
        
        this.generateTransaction();
    }

    stop() {
        this.isRunning = false;
        console.log('\n🛑 Mock data generator stopped');
    }

    generateTransaction() {
        if (!this.isRunning) return;

        // Only Verifone Commander is supported with authentic data
        if (this.posType !== 'verifone_commander') {
            console.error(`❌ POS type '${this.posType}' not supported. Only 'verifone_commander' is available with authentic field data.`);
            console.error(`   Sam4s support removed until real data is collected.`);
            return;
        }

        // Get authentic Verifone transaction with current timestamp
        const template = generateVerifoneTransactionWithTimestamp(null, new Date());
        
        console.log(`\n🧾 Transaction #${this.transactionCounter++} (${this.posType} - AUTHENTIC DATA):`);
        console.log('─'.repeat(60));

        // Send each line with a small delay to simulate real POS timing
        this.sendTransactionLines(template, 0);
    }

    sendTransactionLines(lines, index) {
        if (!this.isRunning || index >= lines.length) {
            // Transaction complete, schedule next one
            if (this.isRunning) {
                setTimeout(() => this.generateTransaction(), this.intervalMs);
            }
            return;
        }

        const line = lines[index];
        
        // Display cleaned version for readability, but emit raw data
        const displayLine = line.replace(/\x1b/g, '\\x1b').replace(/\x01/g, '\\x01').replace(/\x0a/g, '\\x0a');
        console.log(`📝 ${displayLine}`);
        
        // Emit the raw line exactly as it would come from serial port
        this.emit('data', line);

        // Realistic timing based on actual Verifone output (50-200ms between lines)
        const lineDelay = 50 + Math.random() * 150;
        setTimeout(() => this.sendTransactionLines(lines, index + 1), lineDelay);
    }

    // Add some realistic noise and variations
    addNoise(line) {
        // Occasionally add extra spaces or slight variations
        if (Math.random() < 0.1) {
            return line + '  '; // Extra spaces
        }
        if (Math.random() < 0.05) {
            return '  ' + line; // Leading spaces
        }
        return line;
    }

    // Generate custom transaction
    generateCustomTransaction(items) {
        const lines = [];
        let subtotal = 0;

        // Add items
        items.forEach(item => {
            lines.push(`${item.name.padEnd(25)} ${item.price.toFixed(2)}`);
            subtotal += item.price;
        });

        // Add totals
        if (subtotal > 0) {
            lines.push(`SUBTOTAL${' '.repeat(17)}${subtotal.toFixed(2)}`);
            
            const tax = subtotal * 0.08; // 8% tax
            lines.push(`TAX${' '.repeat(22)}${tax.toFixed(2)}`);
            
            const total = subtotal + tax;
            lines.push(`TOTAL${' '.repeat(20)}${total.toFixed(2)}`);
            
            // Random payment method
            const paymentMethods = ['CASH', 'CREDIT', 'DEBIT'];
            const method = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
            lines.push(`${method}${' '.repeat(25 - method.length)}${total.toFixed(2)}`);
            
            if (method === 'CASH') {
                const cashGiven = Math.ceil(total) + Math.floor(Math.random() * 5);
                const change = cashGiven - total;
                if (change > 0) {
                    lines.push(`CHANGE${' '.repeat(19)}${change.toFixed(2)}`);
                }
            }
        }

        lines.push('THANK YOU FOR YOUR VISIT');
        return lines;
    }
}

// CLI interface
function main() {
    const args = process.argv.slice(2);
    const posType = args[0] || 'verifone_commander';
    const intervalMs = parseInt(args[1]) || 2000;

    console.log('🎭 Mock POS Serial Data Generator');
    console.log('================================\n');

    const generator = new MockSerialDataGenerator(posType, intervalMs);

    // Handle the data events (this is what your app would do)
    generator.on('data', (line) => {
        // In a real app, this would go to your parser
        // console.log(`Received: ${line}`);
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
        generator.stop();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        generator.stop();
        process.exit(0);
    });

    // Start generating
    generator.start();
}

// Export for use as module
module.exports = MockSerialDataGenerator;

// Run if called directly
if (require.main === module) {
    main();
}
