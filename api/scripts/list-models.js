// Lists the Gemini models THIS account/key can actually use, so we never guess
// a model name again. Prints each model that supports generateContent.
//
//   node scripts/list-models.js        (from api/, needs AI_API_KEY in .env)
const config = require('../src/config');

async function main() {
  if (!config.aiApiKey) {
    console.error('AI_API_KEY is empty in api/.env.');
    process.exit(1);
  }
  // Native endpoint gives the richest metadata (supported methods per model).
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${config.aiApiKey}&pageSize=200`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`HTTP ${res.status}:`, (await res.text()).slice(0, 400));
    process.exit(1);
  }
  const { models = [] } = await res.json();

  const usable = models
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''));

  console.log(`\n${usable.length} models support generateContent:\n`);
  usable.forEach((id) => console.log('  ' + id));
  console.log('\nPick a "flash" one and set AI_MODEL in api/.env (or keep the');
  console.log('gemini-flash-latest alias if it appears above).');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
