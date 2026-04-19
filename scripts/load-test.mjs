// запуск файлов
// node scripts/load-test.mjs 200
// node scripts/load-test.mjs 500

const BASE_URL = 'http://localhost:3000/webhook/send';
const TOTAL = parseInt(process.argv[2] ?? '60');
const CONCURRENCY = parseInt(process.argv[3] ?? '10');

// Каждый 5-й запрос → DLQ_TRIGGER, каждый 7-й → INVALID
function getPayload(index) {
  if (index % 7 === 0) {
    // INVALID — нет title и description → ValidationPipe → 400
    return { type: 'INVALID', body: { color: 5814783 } };
  }

  if (index % 5 === 0) {
    // DLQ_TRIGGER — пустые строки проходят @IsString() но Discord отклонит → DLQ
    return {
      type: 'DLQ_TRIGGER',
      body: { title: '', description: '', color: 99999999 },
    };
  }

  // VALID
  return {
    type: 'VALID',
    body: {
      title: `Load test #${index}`,
      description: `Automated test request ${index}`,
      color: 5814783,
      footer: { text: `req-${index}` },
    },
  };
}

async function sendRequest(index) {
  const { type, body } = getPayload(index);
  const start = Date.now();

  try {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { index, type, status: res.status, ms: Date.now() - start };
  } catch (err) {
    return { index, type, status: 0, ms: Date.now() - start, error: err.message };
  }
}

async function main() {
  console.log(`\n=== Load Test ===`);
  console.log(`Total: ${TOTAL} requests | Concurrency: ${CONCURRENCY}`);
  console.log(`VALID every request except 5th and 7th`);
  console.log(`DLQ_TRIGGER every 5th (empty fields → Discord 400 → DLQ)`);
  console.log(`INVALID every 7th (missing fields → our 400)\n`);

  const startAll = Date.now();

  const results = await Promise.all(Array.from({ length: TOTAL }, (_, i) => sendRequest(i + 1)));

  const totalMs = Date.now() - startAll;

  const byType = {
    VALID: results.filter((r) => r.type === 'VALID'),
    DLQ_TRIGGER: results.filter((r) => r.type === 'DLQ_TRIGGER'),
    INVALID: results.filter((r) => r.type === 'INVALID'),
  };

  const avgMs = Math.round(results.reduce((acc, r) => acc + r.ms, 0) / results.length);
  const maxMs = Math.max(...results.map((r) => r.ms));
  const minMs = Math.min(...results.map((r) => r.ms));

  console.log('\n\n=== Results ===');
  console.log(`Total time  : ${totalMs}ms`);
  console.log(`Req/sec     : ${Math.round((TOTAL / totalMs) * 1000)}`);
  console.log(`Avg latency : ${avgMs}ms | Min: ${minMs}ms | Max: ${maxMs}ms`);

  console.log('\n--- By type ---');
  for (const [type, items] of Object.entries(byType)) {
    const s202 = items.filter((r) => r.status === 202).length;
    const s400 = items.filter((r) => r.status === 400).length;
    const sOther = items.filter((r) => r.status !== 202 && r.status !== 400).length;
    console.log(`${type.padEnd(12)} total: ${items.length} | 202: ${s202} | 400: ${s400} | other: ${sOther}`);
  }

  console.log('\n--- Expected in RabbitMQ ---');
  const queued =
    byType.VALID.filter((r) => r.status === 202).length + byType.DLQ_TRIGGER.filter((r) => r.status === 202).length;
  const dlqBound = byType.DLQ_TRIGGER.filter((r) => r.status === 202).length;
  console.log(`Queued total  : ${queued}`);
  console.log(`→ webhook.queue (VALID)     : ${queued - dlqBound}`);
  console.log(`→ DLQ bound (DLQ_TRIGGER)   : ${dlqBound} (after Discord rejects them)`);
  console.log(`Rejected by us (INVALID)    : ${byType.INVALID.filter((r) => r.status === 400).length}`);
}

main();
