import Anthropic from '@anthropic-ai/sdk';
import config from '../config.js';

const client = new Anthropic();

function parseJson(text) {
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(stripped);
}

export async function translate({ word, sourceLang, targetLang, context = {} }) {
  const { before = '', after = '' } = context;
  const contextLine = (before || after)
    ? `Context: "${before} [${word}] ${after}"`
    : '';
  const isSingleWord = !word.trim().includes(' ');

  const prompt = isSingleWord
    ? `Translate ONLY the bracketed word from ${sourceLang} to ${targetLang}.
Use the surrounding context solely to determine the correct meaning and grammatical form — do not translate the context itself.
${contextLine ? contextLine : `Word: "[${word}]"`}

Return JSON only: { "isWord": true|false, "translations": ["<most contextually appropriate translation>", "<alternative 2>", ...], "correctedWord": "<correctly spelled word if the input has a typo, otherwise null>" }
Rules: Set "isWord" to false ONLY for pure gibberish or random letters with no recognizable word root (e.g. "zzz", "asdf", "qwerty"). For misspellings or typos of real words (e.g. "magnificient", "recieve"), set "isWord" to true and put the correct spelling in "correctedWord". Include up to 5 alternative translations. First item must be the most contextually appropriate.`
    : `Translate ONLY the bracketed phrase from ${sourceLang} to ${targetLang}.
Use the surrounding context solely to determine the correct meaning and grammatical form — do not translate the context itself.
${contextLine ? contextLine : `Phrase: "[${word}]"`}

Return JSON only: { "translations": ["<translation of [${word}] only>"] }`;

  const message = await client.messages.create({
    model: config.translationModel,
    max_tokens: 128,
    messages: [{ role: 'user', content: prompt }],
  });

  const parsed = parseJson(message.content[0].text);
  if (parsed.isWord === false) {
    return { translations: [], correctedWord: null, tokensIn: message.usage.input_tokens, tokensOut: message.usage.output_tokens };
  }
  const correctedWord = parsed.correctedWord && parsed.correctedWord !== word ? parsed.correctedWord : null;
  return {
    translations: Array.isArray(parsed.translations) ? parsed.translations : [parsed.translations],
    correctedWord,
    tokensIn: message.usage.input_tokens,
    tokensOut: message.usage.output_tokens,
  };
}

export async function getCefr({ word, sourceLang }) {
  const prompt = `Classify the CEFR level of this ${sourceLang} word: "${word}"
Return JSON only: { "cefrLevel": "A1"|"A2"|"B1"|"B2"|"C1"|"C2"|null , "source": "the source of your information, e.g. a dictionary or corpus if available or null" }
Return null for multi-word phrases (a single word with an article is not a multi-word phrase), or unknown words.`;

  const message = await client.messages.create({
    model: config.translationModel,
    max_tokens: 128,
    messages: [{ role: 'user', content: prompt }],
  });

  const parsed = parseJson(message.content[0].text);
  return {
    cefrLevel: parsed.cefrLevel,
    source: parsed.source ?? null,
    tokensIn: message.usage.input_tokens,
    tokensOut: message.usage.output_tokens,
  };
}
