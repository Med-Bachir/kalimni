const http = require('http');
const os = require('os');
const express = require('express');
const cors = require('cors');

const config = require('./src/config');
const { pool } = require('./src/data/pg');
const { initRealtime } = require('./src/realtime');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'kalimni-api' }));

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
