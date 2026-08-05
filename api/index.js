const http = require('http');
const os = require('os');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const config = require('./src/config');
const { pool } = require('./src/data/pg');
const { initRealtime } = require('./src/realtime');
const { requestLog } = require('./src/middleware/requestLog');

const app = express();
// Behind Render's proxy: without this every client shares the proxy's IP and
// one abuser exhausts the whole userbase's rate-limit buckets.
app.set('trust proxy', 1);
app.use(helmet());
// Browsers only — native app requests carry no Origin. CORS_ORIGINS restricts
// the future web clients; unset = permissive (dev / native-only deployments;
// preflight warns in production).
app.use(config.corsOrigins.length ? cors({ origin: config.corsOrigins }) : cors());
app.use(requestLog);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'kalimni-api' }));

// Safety-net health (Phase 1.2): which protective layers are actually alive.
// No PHI — states and counts only, so operators can monitor it unauthenticated.
app.get('/api/health/safety', async (_req, res) => {
  const config = require('./src/config');
  const risk = require('./src/services/riskService');
  const transcription = require('./src/services/transcriptionService');
  const escalation = require('./src/workers/escalation');
  let openScanFailures = null;
  let openAlerts = null;
  let unscannedEncrypted = null;
  try {
    const repos = require('./src/data/repos');
    openScanFailures = await repos.countOpenRiskScanFailures();
    openAlerts = (await repos.openSafetyAlerts()).length;
    unscannedEncrypted = await repos.countUnscannedEncryptedEntries();
  } catch { /* db down — the nulls say so */ }
  res.json({
    keywordLayer: true,
    llmLayer: !!config.aiApiKey,
    transcriptionLayer: transcription.isConfigured(),
    ...risk.healthSnapshot(),        // lastClassifiedAt / lastErrorAt / lastError
    ...escalation.healthSnapshot(),  // lastSweepAt
    openScanFailures,
    openAlerts,
    // Locked journal entries that arrived without a valid safety attestation
    // (Phase 2.5). Not retryable — there is no plaintext left — so this is a
    // standing count of entries the safety net never saw, not a queue. It
    // should be zero; anything else is a client that stopped scanning.
    unscannedEncrypted,
  });
});

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/questionnaires', require('./src/routes/questionnaires'));
app.use('/api/content', require('./src/routes/content'));
app.use('/api/conversations', require('./src/routes/conversations'));
app.use('/api/specialist', require('./src/routes/specialist'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api/safety', require('./src/routes/safety'));
app.use('/api/calls', require('./src/routes/calls'));
app.use('/api/appointments', require('./src/routes/appointments'));
app.use('/api/media', require('./src/routes/media'));
app.use('/api/ai', require('./src/routes/ai'));
app.use('/api/witness', require('./src/routes/witness'));
app.use('/api/journal', require('./src/routes/journal'));

app.use((req, res) => res.status(404).json({ error: 'not_found' }));
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'internal_error' });
});

const server = http.createServer(app);
initRealtime(server);

async function main() {
  try {
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM users');
    console.log(`[db] connected — ${rows[0].n} users`);
    if (rows[0].n === 0) {
      console.log('[db] database is empty — run "npm run db:setup" to load the demo data');
    }
  } catch (err) {
    console.error(`[db] PostgreSQL not ready: ${err.message}`);
    console.error('     1. start it:      docker compose up -d   (from the project root)');
    console.error('     2. create schema: npm run db:setup       (from api/)');
    process.exit(1);
  }

  // Escalation ladder + risk-scan retries (Phase 1.1/1.2). Started only here,
  // never from module load, so tests and scripts stay side-effect free.
  require('./src/workers/escalation').start();

  server.listen(config.port, () => {
    console.log(`Kalimni API listening on port ${config.port}`);
    const nets = os.networkInterfaces();
    Object.values(nets).flat().forEach((net) => {
      if (net && net.family === 'IPv4' && !net.internal) {
        console.log(`  device URL: http://${net.address}:${config.port}/api`);
      }
    });
  });
}

main();
