require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT) || 4000,
  jwtSecret: process.env.JWT_SECRET || 'kalimni-dev-secret',
  tokenTtl: process.env.TOKEN_TTL || '30d',
  mockGoogleAuth: process.env.MOCK_GOOGLE_AUTH !== 'false',
  agoraAppId: process.env.AGORA_APP_ID || '',
  agoraAppCertificate: process.env.AGORA_APP_CERTIFICATE || '',
  databaseUrl: process.env.DATABASE_URL || 'postgres://kalimni:kalimni@localhost:5433/kalimni',

  // AI risk classifier (any OpenAI-compatible endpoint: Gemini, Groq, Ollama...).
  // Leave AI_API_KEY empty to disable the LLM layer — keyword scan still runs.
  aiBaseUrl: process.env.AI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai',
  aiModel: process.env.AI_MODEL || 'gemini-2.5-flash',
  aiApiKey: process.env.AI_API_KEY || '',
};
