const fs = require('fs');

const mashed = '09/19/25 19:12:43 102 ST#AB123               DR#1 TRAN#1023612 09/19/25 19:12:43 102 CSH: CORPORATE         09/19/25 19:12:43';

function loadIndex() {
  jest.resetModules();
  const dbPath = process.env.QUEUE_DB_PATH;
  if (dbPath && fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  return require('../../src/index');
}

describe('end-to-end transaction flow', () => {
  test('queues transaction lines and summary with metadata', async () => {
    const index = loadIndex();
    const { machine, queue } = index;

    const now = Date.now();
    machine.feed('MTN DEW 1 2.49', now);
    machine.feed('TOTAL 2.49', now + 5);
    machine.feed('CASH 5.00', now + 10);
    machine.feed('REFUND -1 -1.00', now + 15);
    machine.feed(mashed, now + 20);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const jobs = [];
    let job = queue.due(Date.now() + 1000);
    while (job) {
      jobs.push(job);
      queue.mark(job.id, true);
      job = queue.due(Date.now() + 1000);
    }

    expect(jobs).toHaveLength(2);

    const linesJob = JSON.parse(jobs[0].body);
    expect(linesJob.lines).toHaveLength(6);
    expect(linesJob.lines[0]).toMatchObject({
      line_type: 'item',
      description: 'MTN DEW',
      qty: 1,
      amount: 2.49,
      transaction_number: '1023612',
    });
    const negativeLine = linesJob.lines.find((line) => line.description.startsWith('REFUND'));
    expect(negativeLine).toMatchObject({ amount: -1, parsed_successfully: true });
    expect(new Set(linesJob.lines.map((line) => line.pos_metadata.drawer_id))).toEqual(new Set(['1']));

    const txnJob = JSON.parse(jobs[1].body);
    expect(txnJob).toMatchObject({
      transaction_number: '1023612',
      drawer_id: '1',
      store_id: 'AB123',
      item_count: 2,
      total: 2.49,
    });
    expect(txnJob.tenders).toMatchObject({ cash: 5 });
    const dbPath = process.env.QUEUE_DB_PATH;
    if (dbPath && fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });
});
