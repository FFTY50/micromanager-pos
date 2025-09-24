const { clean, splitMashedEnd, classify } = require('../../src/parser/verifoneCommander');

describe('verifoneCommander parser', () => {
  test('clean removes control characters but keeps line endings', () => {
    const raw = '\u001b[1mTOTAL 12.34\r\n';
    expect(clean(raw)).toBe('TOTAL 12.34\r\n');
  });

  test('splitMashedEnd splits header and cashier block', () => {
    const raw = '\u001bc0\u000109/19/25 19:12:43 102 ST#AB123               DR#1 TRAN#1023612\u001bc0\u000109/19/25 19:12:43 102 CSH: CORPORATE         09/19/25 19:12:43';
    const parts = splitMashedEnd(raw);
    expect(parts).toEqual([
      '09/19/25 19:12:43 102 ST#AB123               DR#1 TRAN#1023612',
      '09/19/25 19:12:43 102 CSH: CORPORATE         09/19/25 19:12:43',
    ]);
  });

  test('classify recognises totals, tenders and items', () => {
    expect(classify('TOTAL 12.34')).toMatchObject({ type: 'total', amount: 12.34 });
    expect(classify('CASH 20.00')).toMatchObject({ type: 'cash', amount: 20 });
    expect(classify('DEBIT 7.54')).toMatchObject({ type: 'debit', amount: 7.54 });
    expect(classify('SODA 2 3.00')).toMatchObject({ type: 'item', desc: 'SODA', qty: 2, amount: 3 });
    expect(classify('ALARM DOOR')).toMatchObject({ type: 'ignore' });
  });

  test('classify recognises DOB verification lines', () => {
    const raw = '\u001bc0\u000109/24/25 07:23:04 101 DOB Verification: BYPASS Trans#1011395';
    expect(classify(raw)).toMatchObject({
      type: 'age_verification',
      status: 'BYPASS',
      desc: 'DOB Verification: BYPASS',
      transactionNumber: '1011395',
    });
  });
});
