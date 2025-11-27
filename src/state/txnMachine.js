const { splitMashedEnd, classify } = require('../parser/verifoneCommander');
const { randomUUID } = require('crypto');

function makeTxnMachine({ onStart, onLine, onEnd, onParseError }) {
  let state = 'IDLE';
  let pos = 0;
  let meta = null;
  let startedAt = null;
  let currentTxnId = null;

  function reset() {
    state = 'IDLE';
    pos = 0;
    meta = null;
    startedAt = null;
    currentTxnId = null;
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
        currentTxnId = randomUUID();
        if (typeof onStart === 'function') onStart(nowMs, currentTxnId);
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

    emitLine({ nowMs, pos: pos++, c, meta, startedAt, raw, txnId: currentTxnId });

    if (c.type === 'cashier') {
      if (typeof onEnd === 'function') {
        onEnd({ nowMs, meta, startedAt, lastPos: pos, txnId: currentTxnId });
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
          currentTxnId = randomUUID();
          if (typeof onStart === 'function') onStart(nowMs, currentTxnId);
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
