#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Setting up Micromanager POS Project...\n');

// Check Node.js version
const nodeVersion = process.version;
const requiredVersion = 'v18.0.0';
if (nodeVersion < requiredVersion) {
    console.error(`❌ Node.js ${requiredVersion} or higher is required. Current version: ${nodeVersion}`);
    process.exit(1);
}
console.log(`✅ Node.js version: ${nodeVersion}`);

// Create necessary directories
const directories = [
    './logs',
    './transaction-logs',
    './config/backup'
];

directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✅ Created directory: ${dir}`);
    }
});

// Copy environment file if it doesn't exist
if (!fs.existsSync('.env')) {
    fs.copyFileSync('.env.example', '.env');
    console.log('✅ Created .env file from .env.example');
    console.log('⚠️  Please edit .env file with your configuration');
} else {
    console.log('ℹ️  .env file already exists');
}

// Install dependencies
console.log('\n📦 Installing dependencies...');
try {
    execSync('npm install', { stdio: 'inherit' });
    console.log('✅ Dependencies installed successfully');
} catch (error) {
    console.error('❌ Failed to install dependencies:', error.message);
    process.exit(1);
}

// Create systemd service file (Linux only)
if (process.platform === 'linux') {
    const serviceName = 'micromanager-pos';
    const serviceContent = `[Unit]
Description=Micromanager POS Transaction Processor
After=network.target

[Service]
Type=simple
User=${process.env.USER || 'posmonitor'}
WorkingDirectory=${process.cwd()}
ExecStart=${process.execPath} src/app.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=${path.join(process.cwd(), '.env')}

[Install]
WantedBy=multi-user.target
`;

    const serviceFile = `/tmp/${serviceName}.service`;
    fs.writeFileSync(serviceFile, serviceContent);
    console.log(`✅ Created systemd service file: ${serviceFile}`);
    console.log(`ℹ️  To install: sudo cp ${serviceFile} /etc/systemd/system/`);
    console.log(`ℹ️  To enable: sudo systemctl enable ${serviceName}`);
}

// Check for serial port (Linux/Mac only)
if (process.platform !== 'win32') {
    try {
        const serialPorts = execSync('ls /dev/tty* 2>/dev/null | grep -E "(USB|ACM)" || echo "none"', { encoding: 'utf8' }).trim();
        if (serialPorts === 'none') {
            console.log('⚠️  No USB serial ports detected');
            console.log('ℹ️  Make sure your POS device is connected');
        } else {
            console.log('✅ Detected serial ports:');
            serialPorts.split('\n').forEach(port => console.log(`   ${port}`));
        }
    } catch (error) {
        console.log('ℹ️  Could not check serial ports');
    }
}

// Run initial tests
console.log('\n🧪 Running tests...');
try {
    execSync('npm test', { stdio: 'inherit' });
    console.log('✅ Tests passed');
} catch (error) {
    console.log('⚠️  Some tests failed - this is normal if Supabase is not configured yet');
}

// Final setup instructions
console.log('\n🎉 Setup completed! Next steps:\n');
console.log('1. Edit .env file with your Supabase and Frigate configuration');
console.log('2. Run the SQL files in sql/ directory on your Supabase database:');
console.log('   - 01_core_tables.sql');
console.log('   - 02_pattern_discovery.sql');
console.log('3. Configure your POS device serial port in .env');
console.log('4. Test the application: npm run dev');
console.log('5. For production: npm start');

if (process.platform === 'linux') {
    console.log('\nFor production deployment on Linux:');
    console.log(`sudo cp /tmp/${serviceName}.service /etc/systemd/system/`);
    console.log('sudo systemctl daemon-reload');
    console.log(`sudo systemctl enable ${serviceName}`);
    console.log(`sudo systemctl start ${serviceName}`);
}

console.log('\n📚 Documentation:');
console.log('- README.md - Project overview and usage');
console.log('- sql/03_analysis_queries.sql - Useful queries for pattern analysis');
console.log('- Health check: http://localhost:3001/health (if HEALTH_CHECK_PORT=3001)');

console.log('\n✨ Happy parsing! Your micromanager is ready to capture and analyze POS data.');
