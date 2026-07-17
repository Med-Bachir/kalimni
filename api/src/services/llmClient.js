// Shared LLM chat client. One OpenAI-compatible endpoint serves both the risk
// classifier (riskService) and the AI companion (companionService), configured
// via AI_BASE_URL / AI_MODEL / AI_API_KEY in .env (Groq, Gemini, Mistral,
// Ollama — anything OpenAI-compatible).
//
// Free tiers routinely return 503 ("high demand") or 429 (rate limit) —
// transient spikes that a short backoff clears. We retry those (and network
// timeouts) a few times; everything else (401, 404, bad output) fails fast.
const config = require('../config');

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_ATTEMPTS = 4;
const RETRYABLE_HTTP = new Set([429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isConfigured = () => !!config.aiApiKey;

// One HTTP round-trip. Throws { retryable } so the retry loop knows whether
// to back off.
async function callOnce(messages, { maxTokens, temperature, json, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${config.aiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.aiApiKey}`,
      },
      body: JSON.stringify({
        model: config.aiModel,
        temperature,
        // On Gemini this budget also covers the model's hidden "thinking"
        // tokens, so keep it generous — too small returns EMPTY content.
        max_tokens: maxTokens,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
        // reasoning_effort:"none" disables Gemini's thinking (fast + cheap).
        // Groq/Llama and others reject unknown params with a 400, so only
        // send it to Google's endpoint.
        ...(config.aiBaseUrl.includes('googleapis.com') ? { reasoning_effort: 'none' } : {}),
        messages,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`ai_http_${res.status} ${body.slice(0, 300)}`);
      err.retryable = RETRYABLE_HTTP.has(res.status);
      throw err;
    }
    const data = await res.json();
    const choice = data.choices?.[0];
    const raw = (choice?.message?.content || '').trim();
    if (!raw) {
      throw new Error(`ai_empty_content finish=${choice?.finish_reason} usage=${JSON.stringify(data.usage || {})}`);
    }
    return raw;
  } catch (err) {
    // AbortController timeout surfaces as AbortError — treat as retryable.
    if (err.name === 'AbortError') err.retryable = true;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends a chat completion and returns the raw text content.
 * Retries transient failures with exponential backoff, then throws.
 * Throws immediately if no API key is configured — call isConfigured() first.
 */
async function chat(messages, { maxTokens = 512, temperature = 0, json = false, timeoutMs = DEFAULT_TIMEOUT_MS, tag = 'llm' } = {}) {
  if (!config.aiApiKey) throw new Error('ai_not_configured');
  for (let attempt = 1; ; attempt++) {
    try {
      return await callOnce(messages, { maxTokens, temperature, json, timeoutMs });
    } catch (err) {
      if (!err.retryable || attempt >= MAX_ATTEMPTS) throw err;
      const backoff = 500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 300); // 0.5s,1.1s,2.3s...
      console.log(`[${tag}] ${err.message.slice(0, 60)} — retry ${attempt}/${MAX_ATTEMPTS - 1} in ${backoff}ms`);
      await sleep(backoff);
    }
  }
}

/** chat() + strip markdown fences + JSON.parse. */
async function chatJson(messages, opts = {}) {
  const raw = await chat(messages, { ...opts, json: true });
  return JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
}

module.exports = { chat, chatJson, isConfigured };
