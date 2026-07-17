// One-shot diagnostic for the risk classifier. Sends a few phrases straight to
// the LLM and prints the FULL result or the exact error — so when the app
// "only detects the keyword one", this tells you why (bad key, wrong model,
// empty content, rate limit...).
//
//   node scripts/test-risk.js            (from api/, needs AI_API_KEY in .env)
const { classify } = require('../src/services/riskService');
const config = require('../src/config');

const SAMPLES = [
  'nmout w nertah men kolch',          // Arabizi -> expect high
  'الدنيا بلا بيا خير',                  // Darija, no keyword -> expect high
  'tout le monde serait mieux sans moi',// French indirect -> expect high
  'rani meyet men t3ab',               // "dead tired" -> expect none
  'صباح الخير دكتور',                   // normal -> expect none
];

async function main() {
  console.log('base :', config.aiBaseUrl);
  console.log('model:', config.aiModel);
  console.log('key  :', config.aiApiKey ? `${config.aiApiKey.slice(0, 6)}...(${config.aiApiKey.length} chars)` : 'MISSING');
  console.log('');

  if (!config.aiApiKey) {
    console.error('AI_API_KEY is empty in api/.env — the LLM layer is disabled.');
    process.exit(1);
  }

  for (const text of SAMPLES) {
    try {
      const r = await classify(text);
      console.log(`OK   "${text}"\n     -> ${JSON.stringify(r)}\n`);
    } catch (err) {
      console.log(`FAIL "${text}"\n     -> ${err.message}\n`);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
