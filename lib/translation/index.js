import config from './config.js';
import * as mymemory from './providers/mymemory.js';
import * as claude from './providers/claude.js';

function getProvider() {
  return config.provider === 'mymemory' ? mymemory : claude;
}

export async function callTranslate(params) {
  const provider = getProvider();
  try {
    const result = await provider.translate(params);
    return { ...result, provider: config.provider };
  } catch (err) {
    if (!config.fallback || provider === mymemory) throw err;
    console.warn('[translation] Claude failed, falling back to MyMemory:', err.message);
    const result = await mymemory.translate(params);
    return { ...result, provider: 'mymemory' };
  }
}

export async function callGetCefr(params) {
  try {
    return await claude.getCefr(params);
  } catch (err) {
    console.warn('[translation] CEFR lookup failed:', err.message);
    return { cefrLevel: null, source: null, tokensIn: 0, tokensOut: 0 };
  }
}
