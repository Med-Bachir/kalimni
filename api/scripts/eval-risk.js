// Runs the labeled test set (eval/risk-eval.jsonl) through the LLM risk
// classifier and reports the two numbers that matter:
//
//   HIGH RECALL   — % of expected-high messages classified high. This is the
//                   safety metric: every miss is a patient in danger without
//                   an alert. Target >= 95% before trusting the layer.
//   FALSE ALARMS  — % of expected-none messages classified high. Alert
//                   fatigue metric: too many and specialists stop looking.
//
// "low" expectations are informational: low vs none disagreements are printed
// but don't count as failures (only wrongly-HIGH does).
//
//   npm run eval:risk          (from api/, needs AI_API_KEY in .env)
//
// Calls run sequentially with a delay to stay inside free-tier rate limits
// (Gemini free ~10 req/min). Override with EVAL_DELAY_MS.
const fs = require('fs');
const path = require('path');
const { classify } = require('../src/services/riskService');
const config = require('../src/config');

const DELAY_MS = Number(process.env.EVAL_DELAY_MS) || 6500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!config.aiApiKey) {
    console.error('AI_API_KEY is not set in api/.env — nothing to evaluate.');
    process.exit(1);
  }

  const file = path.join(__dirname, '..', 'eval', 'risk-eval.jsonl');
  const cases = fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));

  console.log(`[eval] ${cases.length} cases against ${config.aiModel} (${DELAY_MS}ms between calls)\n`);

  const results = [];
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    let got;
    try {
      const r = await classify(c.text);
      got = r.risk;
      process.stdout.write(
        `${String(i + 1).padStart(2)}/${cases.length}  expected=${c.expected.padEnd(4)} got=${got.padEnd(4)} ` +
        `${got === c.expected ? 'ok ' : 'MISS'}  ${c.note}\n`
      );
    } catch (err) {
      got = 'error';
      process.stdout.write(`${String(i + 1).padStart(2)}/${cases.length}  ERROR ${err.message.slice(0, 120)}\n`);
    }
    results.push({ ...c, got });
    if (i < cases.length - 1) await sleep(DELAY_MS);
  }

  // --- metrics ---------------------------------------------------------------
  const highs = results.filter((r) => r.expected === 'high');
  const nones = results.filter((r) => r.expected === 'none');
  const errors = results.filter((r) => r.got === 'error');

  const caught = highs.filter((r) => r.got === 'high');
  const falseAlarms = nones.filter((r) => r.got === 'high');
  const exact = results.filter((r) => r.got === r.expected);

  console.log('\n================ RESULTS ================');
  console.log(`HIGH RECALL : ${caught.length}/${highs.length} (${((caught.length / highs.length) * 100).toFixed(1)}%)  <- must be >= 95%`);
  console.log(`FALSE ALARMS: ${falseAlarms.length}/${nones.length} (${((falseAlarms.length / nones.length) * 100).toFixed(1)}%)`);
  console.log(`EXACT MATCH : ${exact.length}/${results.length} (${((exact.length / results.length) * 100).toFixed(1)}%)`);
  if (errors.length) console.log(`ERRORS      : ${errors.length} (rate limit? check AI_API_KEY / EVAL_DELAY_MS)`);

  const missedHighs = highs.filter((r) => r.got !== 'high');
  if (missedHighs.length) {
    console.log('\nMISSED HIGH-RISK CASES (dangerous — fix the prompt):');
    missedHighs.forEach((r) => console.log(`  [got ${r.got}] ${r.text}  (${r.note})`));
  }
  if (falseAlarms.length) {
    console.log('\nFALSE ALARMS (annoying — tune if frequent):');
    falseAlarms.forEach((r) => console.log(`  ${r.text}  (${r.note})`));
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('[eval] failed:', err);
  process.exit(1);
});
