// Voice-note transcription for the safety net. Any OpenAI-compatible
// /audio/transcriptions endpoint (OpenAI whisper-1, Groq whisper-large-v3-*,
// self-hosted Whisper). Configured via TRANSCRIBE_BASE_URL / TRANSCRIBE_MODEL /
// TRANSCRIBE_API_KEY; when AI_BASE_URL already points at a provider that
// hosts Whisper, config.js defaults to that same endpoint + key.
//
// Returns the transcript text, or null when no provider is configured.
// Throws on provider errors — the caller records the failure so the message
// is visibly unscreened rather than silently dropped.
const fs = require('fs');
const config = require('../config');

const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const RETRYABLE_HTTP = new Set([429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isConfigured = () => !!(config.transcribeBaseUrl && config.transcribeApiKey);

async function callOnce(filePath) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const form = new FormData();
    // Voice notes are capped at 5MB by the upload route — fine to buffer.
    form.append('file', new Blob([await fs.promises.readFile(filePath)], { type: 'audio/mp4' }), 'voice.m4a');
    form.append('model', config.transcribeModel);
    form.append('response_format', 'json');

    const res = await fetch(`${config.transcribeBaseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.transcribeApiKey}` },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`transcribe_http_${res.status} ${body.slice(0, 200)}`);
      err.retryable = RETRYABLE_HTTP.has(res.status);
      throw err;
    }
    const data = await res.json();
    return String(data.text || '');
  } catch (err) {
    if (err.name === 'AbortError') err.retryable = true;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function transcribeFile(filePath) {
  if (!isConfigured()) return null;
  for (let attempt = 1; ; attempt++) {
    try {
      return await callOnce(filePath);
    } catch (err) {
      if (!err.retryable || attempt >= MAX_ATTEMPTS) throw err;
      const backoff = 1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 300);
      console.log(`[transcribe] ${String(err.message).slice(0, 60)} — retry ${attempt}/${MAX_ATTEMPTS - 1} in ${backoff}ms`);
      await sleep(backoff);
    }
  }
}

module.exports = { transcribeFile, isConfigured };
