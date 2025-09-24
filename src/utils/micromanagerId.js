const os = require('os');

function normalizeMac(mac) {
  if (!mac) return '';
  return mac.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
}

function pickMac(env = process.env) {
  const candidates = [
    env.TERMINAL_ID,
    env.HOST_ETH0_MAC,
    env.HOST_WLAN0_MAC,
    env.HOST_WLAN_MAC,
    env.HOST_MAC,
  ];

  for (const candidate of candidates) {
    if (candidate) return candidate;
  }

  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const addr of addresses) {
      if (!addr.internal && addr.mac && addr.mac !== '00:00:00:00:00:00') {
        return addr.mac;
      }
    }
  }

  return null;
}

function portSuffixFrom(serialPort) {
  if (!serialPort) return '0';
  const match = serialPort.match(/tty(?:USB|ACM)(\d+)/i);
  if (match) return match[1];
  const endingDigits = serialPort.match(/(\d+)$/);
  if (endingDigits) return endingDigits[1];
  return '0';
}

function deriveMicromanagerId({ env = process.env, serialPort, fallbackSerialPort } = {}) {
  if (env?.MICROMANAGER_ID) return env.MICROMANAGER_ID;
  if (env?.DEVICE_ID) return env.DEVICE_ID;

  const macValue = normalizeMac(pickMac(env));
  const lastSix = macValue ? macValue.slice(-6) : '000000';
  const portSuffix = portSuffixFrom(serialPort || fallbackSerialPort);

  return `mmd-rv1-${lastSix}-${portSuffix}`;
}

module.exports = { deriveMicromanagerId };
