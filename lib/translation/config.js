const config = {
  provider: process.env.TRANSLATION_PROVIDER ?? 'claude',
  translationModel: process.env.TRANSLATION_MODEL ?? 'claude-haiku-4-5-20251001',
  fallback: process.env.TRANSLATION_FALLBACK !== 'false',
  contextSpanWords: parseInt(process.env.CONTEXT_SPAN_WORDS ?? '12', 10),
  provideContextForLongText: process.env.PROVIDE_CONTEXT_FOR_LONG_TEXT === 'true',
  cefrFromAI: process.env.CEFR_FROM_AI !== 'false',
  logAiCalls: process.env.LOG_AI_CALLS !== 'false',
};

export default config;
