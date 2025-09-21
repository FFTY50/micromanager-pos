/* eslint-disable no-control-regex */
const TS_RE = /\b\d{2}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\b/g;

const RE = {
  END_HEADER: /\bST#(?<store>\S+)\s+DR#(?<drawer>\S+)\s+TRAN#(?<txn>\d+)/,
  CASHIER: /\bCSH:\s*(?<cashier>[A-Z0-9 .'-]+)/,
  TOTAL: /^TOTAL\s+(?<amount>-?\d+(?:\.\d{1,2})?)$/,
  CASH: /^CASH\s+(?<amount>-?\d+(?:\.\d{1,2})?)$/,
  DEBIT: /^DEBIT\s+(?<amount>-?\d+(?:\.\d{1,2})?)$/,
  ITEM: /^(?<desc>.+?)\s+(?<qty>-?\d+(?:\.\d+)?)\s+(?<amount>-?\d+(?:\.\d{1,2})?)$/,
  IGNORE: /^ALARM\b/i,
};

function clean(raw) {
  if (!raw) return '';
  return raw
    .replace(/\u001bc0/g, '')
    .replace(/\u001b\[[0-9;?]*[\x20-\x2F]*[@-~]/g, '')
    .replace(/\u001b./g, '')
    .replace(/[^\x20-\x7E\r\n]/g, '')
    .replace(/^(?:c0)+/gm, '');
}

function splitMashedEnd(raw) {
  const s = clean(raw);
  if (s.includes(' ST#') && s.includes(' CSH:')) {
    const cashIdx = s.indexOf(' CSH:');
    const beforeCashier = s.slice(0, cashIdx);
    const tsMatch = beforeCashier.match(/(\d{2}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\s+\d{3})$/);
    if (tsMatch) {
      const tsStart = beforeCashier.lastIndexOf(tsMatch[1]);
      const header = beforeCashier.slice(0, tsStart).trim();
      const cashier = `${beforeCashier.slice(tsStart)}${s.slice(cashIdx)}`.trim();
      return [header, cashier];
    }
    return [beforeCashier.trim(), s.slice(cashIdx).trim()];
  }
  const matches = [...s.matchAll(TS_RE)].map(m => m.index);
  if (matches.length >= 2) {
    const idx = matches[1];
    return [s.slice(0, idx).trim(), s.slice(idx).trim()];
  }
  return null;
}

function classify(raw) {
  const line = clean(raw).trim();
  if (!line) return { type: 'empty', line };
  if (RE.IGNORE.test(line)) return { type: 'ignore', line };
  const mHeader = line.match(RE.END_HEADER);
  if (mHeader) return { type: 'end_header', line, ...mHeader.groups };
  const mCsh = line.match(RE.CASHIER);
  if (mCsh) return { type: 'cashier', line, cashier: mCsh.groups.cashier };
  const mTot = line.match(RE.TOTAL);
  if (mTot) return { type: 'total', line, amount: Number(mTot.groups.amount) };
  const mCash = line.match(RE.CASH);
  if (mCash) return { type: 'cash', line, amount: Number(mCash.groups.amount) };
  const mDebit = line.match(RE.DEBIT);
  if (mDebit) return { type: 'debit', line, amount: Number(mDebit.groups.amount) };
  const mItem = line.match(RE.ITEM);
  if (mItem) {
    return {
      type: 'item',
      line,
      desc: mItem.groups.desc.trim(),
      qty: Number(mItem.groups.qty),
      amount: Number(mItem.groups.amount),
    };
  }
  return { type: 'unknown', line };
}

module.exports = { clean, splitMashedEnd, classify, RE, TS_RE };
