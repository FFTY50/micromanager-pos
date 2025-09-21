const fs = require('fs');
const path = require('path');
const { createQueue } = require('../../src/queue/sqliteQueue');

describe('sqlite queue retry strategy', () => {
  const dbPath = path.join(__dirname, '..', 'test-logs', 'queue-backoff.db');

  beforeEach(() => {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  test('backs off exponentially and caps after ten failures', () => {
    const queue = createQueue({ dbPath }, console);
    expect(queue).toBeDefined();

    const nowSpy = jest.spyOn(Date, 'now');
    let currentSeconds = 1_700_000_000;
    const setNow = (seconds) => {
      currentSeconds = seconds;
      nowSpy.mockReturnValue(seconds * 1000);
    };

    setNow(currentSeconds);

    queue.push('test', 'https://example.com', { hello: 'world' });
    let job = queue.due(Date.now());
    expect(job).toBeTruthy();

    for (let attempt = 1; attempt <= 11; attempt += 1) {
      setNow(currentSeconds);
      queue.mark(job.id, false);
      const expectedDelay = attempt >= 10 ? 300 : Math.min(2 ** (attempt - 1), 60);
      currentSeconds += expectedDelay;
      setNow(currentSeconds);
      job = queue.due(Date.now());
      expect(job).toBeTruthy();
      expect(job.tries).toBe(attempt);
      expect(job.next_at).toBe(currentSeconds);
    }

    setNow(currentSeconds);
    queue.mark(job.id, true);
    expect(queue.depth()).toBe(0);
    if (queue.db?.close) {
      queue.db.close();
    }
  });
});
