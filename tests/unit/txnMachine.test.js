const { makeTxnMachine } = require('../../src/state/txnMachine');

function mashedEnd() {
  return '09/19/25 19:12:43 102 ST#AB123               DR#1 TRAN#1023612 09/19/25 19:12:43 102 CSH: CORPORATE         09/19/25 19:12:43';
}

describe('transaction state machine', () => {
  test('transitions from idle to in_txn and back', () => {
    const starts = [];
    const lines = [];
    const ends = [];

    const machine = makeTxnMachine({
      onStart: (now) => starts.push(now),
      onLine: (line) => lines.push(line),
      onEnd: (payload) => ends.push(payload),
    });

    const baseTime = Date.now();
    machine.feed('ALARM BEEP', baseTime);
    machine.feed('PEPSI 1 2.00', baseTime + 10);
    machine.feed('TOTAL 2.00', baseTime + 20);
    machine.feed('UNKNOWN LINE', baseTime + 30);
    machine.feed(mashedEnd(), baseTime + 40);

    expect(starts).toHaveLength(1);
    expect(lines.map((l) => l.c.type)).toEqual(['item', 'total', 'unknown', 'end_header', 'cashier']);
    expect(ends).toHaveLength(1);
    expect(ends[0].meta).toMatchObject({ transaction_number: '1023612', drawer_id: '1', store_id: 'AB123' });
  });
});
