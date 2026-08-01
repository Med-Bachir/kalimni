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

  // The merge gate (Phase 3.4.1). Recall on expected-high is the number that
  // matters: a false positive costs thirty seconds of annoyance, a false
  // negative costs something that cannot be gotten back. Errors on high cases
  // count as misses (an unevaluated crisis message is not a caught one).
  const MIN_HIGH_RECALL = Number(process.env.EVAL_MIN_HIGH_RECALL) || 0.98;
  const recall = highs.length ? caught.length / highs.length : 1;

  console.log('\n================ RESULTS ================');
  console.log(`HIGH RECALL : ${caught.length}/${highs.length} (${(recall * 100).toFixed(1)}%)  <- gate: >= ${(MIN_HIGH_RECALL * 100).toFixed(0)}%`);
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

  if (errors.length > results.length * 0.2) {
    console.error(`\nFAIL: ${errors.length}/${results.length} cases errored — eval inconclusive (provider down or rate-limited).`);
    process.exit(2);
  }
  if (recall < MIN_HIGH_RECALL) {
    console.error(`\nFAIL: high recall ${(recall * 100).toFixed(1)}% is below the ${(MIN_HIGH_RECALL * 100).toFixed(0)}% gate. Do not ship this classifier.`);
    process.exit(1);
  }
  console.log('\nPASS: high recall meets the gate.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[eval] failed:', err);
  process.exit(1);
});
