const fs = require('fs');
const path = require('path');

async function exists(p) {
  try {
    await fs.promises.access(p, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch (err) {
    return false;
  }
}

async function autoDetectSerialPort({ explicit, paths = [], prefix = '/dev/ttyUSB' } = {}, logger = console) {
  if (explicit && await exists(explicit)) {
    return explicit;
  }

  for (const p of paths) {
    if (await exists(p)) {
      return p;
    }
  }

  try {
    const devDir = '/dev';
    const entries = await fs.promises.readdir(devDir);
    const matches = entries
      .filter((name) => name.startsWith(path.basename(prefix)))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    for (const name of matches) {
      const candidate = path.join(devDir, name);
      if (await exists(candidate)) {
        return candidate;
      }
    }
  } catch (err) {
    logger.warn?.(`serial: failed to auto-detect port – ${err.message}`);
  }

  return null;
}

module.exports = { autoDetectSerialPort };
