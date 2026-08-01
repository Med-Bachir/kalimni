// Phase 0.1 / 0.2 boot behavior — real child processes, no mocks, so the test
// proves what an operator actually gets. Vars are set to explicit values
// (dotenv fills only ABSENT vars from .env, so empty/short values stick).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const path = require('node:path');
const API_DIR = path.join(__dirname, '..');

function bootConfig(env) {
  try {
    const out = execFileSync(
      process.execPath,
      ['-e', "require('./src/config'); console.log('CONFIG_OK')"],
      { cwd: API_DIR, env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    return { ok: true, out };
  } catch (err) {
    return { ok: false, out: `${err.stdout || ''}${err.stderr || ''}` };
  }
}

const GOOD = {
  JWT_SECRET: 'x'.repeat(48),
  DATABASE_URL: 'postgres://k:k@localhost:5433/k',
  MOCK_GOOGLE_AUTH: 'false',
  NODE_ENV: 'test',
  // Production boots also require the LLM safety layer (or an explicit
  // opt-out) — see the dedicated tests below.
  AI_API_KEY: 'test-key',
};

describe('config fail-closed boot (0.1 / 0.2)', () => {
  it('boots with a full environment', () => {
    const r = bootConfig(GOOD);
    expect(r.ok).toBe(true);
    expect(r.out).toContain('CONFIG_OK');
  });

  it('refuses to boot without JWT_SECRET', () => {
    const r = bootConfig({ ...GOOD, JWT_SECRET: '' });
    expect(r.ok).toBe(false);
    expect(r.out).toContain('JWT_SECRET');
  });

  it('refuses a short JWT_SECRET (the old .env.example placeholder)', () => {
    const r = bootConfig({ ...GOOD, JWT_SECRET: 'change-it-in-production' });
    expect(r.ok).toBe(false);
    expect(r.out).toContain('JWT_SECRET');
  });

  it('refuses to boot without DATABASE_URL', () => {
    const r = bootConfig({ ...GOOD, DATABASE_URL: '' });
    expect(r.ok).toBe(false);
    expect(r.out).toContain('DATABASE_URL');
  });

  it('refuses MOCK_GOOGLE_AUTH=true in production', () => {
    const r = bootConfig({ ...GOOD, MOCK_GOOGLE_AUTH: 'true', NODE_ENV: 'production' });
    expect(r.ok).toBe(false);
    expect(r.out).toContain('MOCK_GOOGLE_AUTH');
  });

  it('reports every problem at once', () => {
    const r = bootConfig({ ...GOOD, JWT_SECRET: '', DATABASE_URL: '', MOCK_GOOGLE_AUTH: 'true', NODE_ENV: 'production' });
    expect(r.ok).toBe(false);
    expect(r.out).toContain('JWT_SECRET');
    expect(r.out).toContain('DATABASE_URL');
    expect(r.out).toContain('MOCK_GOOGLE_AUTH');
  });

  it('mock mode stays OFF unless the value is exactly "true"', () => {
    for (const value of ['', '1', 'TRUE', 'yes', 'false']) {
      const r = bootConfig({ ...GOOD, MOCK_GOOGLE_AUTH: value, NODE_ENV: 'production' });
      expect(r.ok, `MOCK_GOOGLE_AUTH=${JSON.stringify(value)} must not enable the bypass`).toBe(true);
    }
  });

  it('production without the LLM safety layer refuses to boot (1.2)', () => {
    const r = bootConfig({ ...GOOD, NODE_ENV: 'production', AI_API_KEY: '' });
    expect(r.ok).toBe(false);
    expect(r.out).toContain('AI_API_KEY');
  });

  it('keyword-only production requires the explicit opt-out', () => {
    const r = bootConfig({ ...GOOD, NODE_ENV: 'production', AI_API_KEY: '', ALLOW_NO_LLM_SAFETY: 'true' });
    expect(r.ok).toBe(true);
  });
});
