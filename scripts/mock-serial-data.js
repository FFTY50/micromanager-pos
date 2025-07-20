#!/usr/bin/env node

/**
 * Mock Serial Data Generator
 * Simulates POS transaction data for testing without actual hardware
 * Usage: node scripts/mock-serial-data.js [pos_type] [interval_ms]
 */

const EventEmitter = require('events');
const fs = require('fs');

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
        return {
            verifone_commander: [
                // Standard sale transaction
                [
                    'COCA COLA                    2.50',
                    'CHIPS REGULAR                1.99',
                    'SUBTOTAL                     4.49',
                    'TAX                          0.36',
                    'TOTAL                        4.85',
                    'CASH                         5.00',
                    'CHANGE                       0.15',
                    'THANK YOU FOR YOUR VISIT'
                ],
                // Transaction with unknown lines (for testing)
                [
                    'ENERGY DRINK                 3.99',
                    'EMPLOYEE DISCOUNT 10%',  // Unknown line
                    'SUBTOTAL                     3.59',
                    'STORE CREDIT APPLIED',    // Unknown line
                    'TAX                          0.29',
                    'TOTAL                        3.88',
                    'CREDIT                       3.88',
                    'RECEIPT TOTAL'
                ],
                // Void transaction
                [
                    'CANDY BAR                    1.50',
                    'VOID                         1.50',
                    'NO SALE',
                    'HAVE A NICE DAY'
                ]
            ],
            sams4s: [
                [
                    '01-15-2025 14:30 POS-MAIN JOHN',
                    'PLU 12345 COFFEE             2.25',
                    'DEPT 02 DONUT               1.50',
                    'SUBTOTAL                     3.75',
                    'TAX                          0.30',
                    'TOTAL                        4.05',
                    'CASH                         5.00',
                    'CHANGE                       0.95',
                    '01-15-2025 14:31 POS-MAIN COMPLETE'
                ],
                [
                    '01-15-2025 15:45 POS-MAIN SARAH',
                    'PLU 98765 SANDWICH           6.99',
                    'LOYALTY DISCOUNT 5%',     // Unknown line
                    'TAX                          0.56',
                    'TOTAL                        7.55',
                    'CARD                         7.55',
                    '01-15-2025 15:46 POS-MAIN COMPLETE'
                ]
            ]
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

        const templates = this.templates[this.posType];
        if (!templates) {
            console.error(`❌ No templates found for POS type: ${this.posType}`);
            return;
        }

        // Pick a random transaction template
        const template = templates[Math.floor(Math.random() * templates.length)];
        
        console.log(`\n🧾 Transaction #${this.transactionCounter++} (${this.posType}):`);
        console.log('─'.repeat(50));

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
        console.log(`📝 ${line}`);
        
        // Emit the line (your app would listen to this)
        this.emit('data', line);

        // Send next line after a short delay (100-500ms)
        const lineDelay = 100 + Math.random() * 400;
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
