const { splitMashedEnd, classify } = require('../parser/verifoneCommander');

function makeTxnMachine({ onStart, onLine, onEnd, onParseError }) {
  let state = 'IDLE';
  let pos = 0;
  let meta = null;
  let startedAt = null;

  function reset() {
    state = 'IDLE';
    pos = 0;
    meta = null;
    startedAt = null;
  }

  function emitLine(payload) {
    if (typeof onLine === 'function') onLine(payload);
  }

  function handleClassified({ nowMs, c, raw }) {
    if (c.type === 'empty' || c.type === 'ignore') return;

    if (state === 'IDLE') {
      if (['item', 'total', 'cash', 'debit', 'unknown'].includes(c.type)) {
        state = 'IN_TXN';
        startedAt = new Date(nowMs).toISOString();
        if (typeof onStart === 'function') onStart(nowMs);
      } else {
        return;
      }
    }

    if (c.type === 'end_header') {
      meta = {
        ...(meta || {}),
        store_id: c.store,
        drawer_id: c.drawer,
        transaction_number: c.txn,
      };
    }

    if (typeof onParseError === 'function' && c.type === 'unknown') {
      onParseError({ nowMs, raw });
    }

    emitLine({ nowMs, pos: pos++, c, meta, startedAt, raw });

    if (c.type === 'cashier') {
      if (typeof onEnd === 'function') {
        onEnd({ nowMs, meta, startedAt, lastPos: pos });
      }
      reset();
    }
  }

  return {
    feed(raw, nowMs) {
      const pair = splitMashedEnd(raw);
      if (pair) {
        if (state === 'IDLE') {
          state = 'IN_TXN';
          startedAt = new Date(nowMs).toISOString();
          if (typeof onStart === 'function') onStart(nowMs);
        }
        const [hdr, csh] = pair;
        const headerClass = classify(hdr);
        handleClassified({ nowMs, c: headerClass, raw: hdr });
        const cashierClass = classify(csh);
        handleClassified({ nowMs, c: cashierClass, raw: csh });
        return;
      }

      const c = classify(raw);
      handleClassified({ nowMs, c, raw });
    }
  };
}

module.exports = { makeTxnMachine };
