#!/usr/bin/env node

/**
 * Quick Start Demo Script
 * Demonstrates the micromanager system with mock data
 * Perfect for testing and demonstrations
 */

const MicroManagerApp = require('../src/app');
const MockSerialDataGenerator = require('./mock-serial-data');
const path = require('path');

class DemoRunner {
    constructor() {
        this.app = null;
        this.mockGenerator = null;
        this.demoConfig = null;
    }

    async setup() {
        console.log('🎭 Micromanager POS Demo Setup');
        console.log('==============================\n');

        // Create demo configuration
        this.demoConfig = {
            deviceId: 'demo-device-001',
            posType: 'verifone_commander',
            serialPort: '/dev/null', // Not used in demo
            baudRate: 9600,
            storeId: 'demo-store',
            storeNumber: '001',
            posTerminalId: 'demo-terminal',
            parserVersion: '1.0.0-demo',
            
            supabase: {
                url: process.env.SUPABASE_URL || 'https://demo.supabase.co',
                key: process.env.SUPABASE_KEY || 'demo-key'
            },
            
            frigate: {
                baseUrl: process.env.FRIGATE_URL || 'http://localhost:5000',
                cameraName: 'demo_camera'
            },
            
            backup: {
                logDirectory: './demo-transaction-logs',
                retentionDays: 7
            },
            
            posTypes: {
                verifone_commander: {
                    name: "Verifone Commander (Demo)",
                    transaction: {
                        patterns: {
                            lineItem: "^(.+?)\\s+(\\d+\\.\\d{2})$",
                            total: "^TOTAL\\s+(\\d+\\.\\d{2})$",
                            cash: "^CASH\\s+(\\d+\\.\\d{2})$",
                            credit: "^CREDIT\\s+(\\d+\\.\\d{2})$",
                            endTransaction: "^(THANK YOU|RECEIPT TOTAL).*$"
                        }
                    },
                    serial: {
                        dataBits: 8,
                        stopBits: 1,
                        parity: 'none'
                    }
                }
            }
        };

        // Write demo config to file
        const fs = require('fs');
        const configPath = path.join(__dirname, '../config/demo.json');
        fs.writeFileSync(configPath, JSON.stringify(this.demoConfig, null, 2));
        
        console.log('✅ Demo configuration created');
        return configPath;
    }

    async startDemo() {
        const configPath = await this.setup();
        
        try {
            // Initialize the micromanager app with demo config
            this.app = new MicroManagerApp(configPath);
            
            // Mock external dependencies for demo
            this.mockExternalServices();
            
            // Initialize without serial port
            await this.initializeWithoutSerial();
            
            // Start mock data generator
            this.startMockDataGenerator();
            
            console.log('\n🚀 Demo started successfully!');
            console.log('👀 Watch the console for transaction processing...');
            console.log('🛑 Press Ctrl+C to stop the demo\n');
            
        } catch (error) {
            console.error('❌ Demo startup failed:', error.message);
            process.exit(1);
        }
    }

    mockExternalServices() {
        // Mock Supabase for demo
        if (this.app.transactionProcessor) {
            this.app.transactionProcessor.sendLineToSupabase = async (line) => {
                console.log(`📤 [SUPABASE] ${line.line_type}: ${line.description}`);
                return Promise.resolve();
            };
            
            this.app.transactionProcessor.sendTransactionToSupabase = async (transaction) => {
                console.log(`🧾 [SUPABASE] Transaction complete: $${transaction.total_amount}`);
                return Promise.resolve();
            };
            
            this.app.transactionProcessor.createFrigateEvent = async (transactionId) => {
                const eventId = `demo-event-${Date.now()}`;
                console.log(`🎥 [FRIGATE] Created event: ${eventId}`);
                return Promise.resolve(eventId);
            };
            
            this.app.transactionProcessor.endFrigateEvent = async (eventId) => {
                console.log(`🎬 [FRIGATE] Ended event: ${eventId}`);
                return Promise.resolve();
            };
        }
    }

    async initializeWithoutSerial() {
        // Initialize everything except serial port
        this.app.config = this.demoConfig;
        this.app.initializePOSParser();
        
        // Skip serial initialization for demo
        this.app.isRunning = true;
        this.app.setupGracefulShutdown();
        
        console.log('✅ Parser initialized:', this.app.posParser.getParserInfo().name);
    }

    startMockDataGenerator() {
        this.mockGenerator = new MockSerialDataGenerator('verifone_commander', 5000);
        
        // Connect mock generator to app
        this.mockGenerator.on('data', (line) => {
            this.app.handleSerialData(line);
        });
        
        this.mockGenerator.start();
    }

    stop() {
        console.log('\n🛑 Stopping demo...');
        
        if (this.mockGenerator) {
            this.mockGenerator.stop();
        }
        
        console.log('✅ Demo stopped');
        process.exit(0);
    }
}

// CLI interface
async function main() {
    const demo = new DemoRunner();
    
    // Graceful shutdown
    process.on('SIGINT', () => demo.stop());
    process.on('SIGTERM', () => demo.stop());
    
    await demo.startDemo();
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Demo failed:', error);
        process.exit(1);
    });
}

module.exports = DemoRunner;
