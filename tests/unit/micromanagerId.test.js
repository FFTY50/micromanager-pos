const os = require('os');
const { deriveMicromanagerId } = require('../../src/utils/micromanagerId');

describe('deriveMicromanagerId', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns explicit MICROMANAGER_ID when provided', () => {
    const env = { MICROMANAGER_ID: 'custom-id' };
    expect(deriveMicromanagerId({ env, serialPort: '/dev/ttyUSB0' })).toBe('custom-id');
  });

  test('falls back to DEVICE_ID when MICROMANAGER_ID missing', () => {
    const env = { DEVICE_ID: 'legacy-id' };
    expect(deriveMicromanagerId({ env, serialPort: '/dev/ttyUSB1' })).toBe('legacy-id');
  });

  test('derives id from terminal MAC and serial port', () => {
    const env = { TERMINAL_ID: '2c:cf:67:24:61:b4' };
    expect(deriveMicromanagerId({ env, serialPort: '/dev/ttyUSB0' })).toBe('mmd-rv1-2461b4-0');
    expect(deriveMicromanagerId({ env, serialPort: '/dev/ttyUSB1' })).toBe('mmd-rv1-2461b4-1');
  });

  test('uses fallback serial port when explicit missing', () => {
    const env = { TERMINAL_ID: 'aa:bb:cc:dd:ee:ff' };
    expect(deriveMicromanagerId({ env, fallbackSerialPort: '/dev/ttyUSB3' })).toBe('mmd-rv1-ddeeff-3');
  });

  test('falls back to system MAC when env lacks identifiers', () => {
    jest.spyOn(os, 'networkInterfaces').mockReturnValue({
      eth0: [
        { internal: false, family: 'IPv4', mac: '11:22:33:44:55:66' },
      ],
    });

    expect(deriveMicromanagerId({ env: {}, serialPort: '/dev/ttyUSB2' })).toBe('mmd-rv1-445566-2');
  });
});
