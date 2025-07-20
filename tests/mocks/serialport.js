// Mock SerialPort for testing
const EventEmitter = require('events');

class MockSerialPort extends EventEmitter {
  constructor(options) {
    super();
    this.path = options.path;
    this.baudRate = options.baudRate;
    this.isOpen = false;
    
    // Simulate async port opening
    setImmediate(() => {
      this.isOpen = true;
      this.emit('open');
    });
  }

  pipe(parser) {
    // Return the parser for chaining
    return parser;
  }

  close(callback) {
    this.isOpen = false;
    this.emit('close');
    if (callback) callback();
  }

  write(data, callback) {
    if (callback) callback();
  }
}

// Mock parser
class MockReadlineParser extends EventEmitter {
  constructor(options) {
    super();
    this.delimiter = options.delimiter;
  }

  // Simulate receiving data
  simulateData(line) {
    this.emit('data', line);
  }
}

module.exports = MockSerialPort;
module.exports.ReadlineParser = MockReadlineParser;
