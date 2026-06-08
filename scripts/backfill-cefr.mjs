// One-time script: backfills cefrLevel for existing Word rows using the local cefr.json dict.
// Words not found in the dict keep cefrLevel = null (AI fallback applies on next save).
// Run with: node scripts/backfill-cefr.mjs

import { createClient } from '@libsql/client';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { config } from 'dotenv';

config();

const __dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const cefrData = require(resolve(__dir, '../utils/cefr.json'));

function getCefrLevel(word, lang) {
  const langMap = cefrData[lang];
  if (!langMap) return null;
  const normalized = word.toLowerCase().trim();
  const direct = langMap[normalized] ?? null;
  if (direct !== null) return direct;
  if (lang === 'en' && normalized.endsWith('s')) {
    return langMap[normalized.slice(0, -1)] ?? null;
  }
  return null;
}

const client = createClient({ url: process.env.DATABASE_URL });

const { rows } = await client.execute('SELECT id, word, sourceLang FROM "Word" WHERE cefrLevel IS NULL');
console.log(`Found ${rows.length} words without cefrLevel.`);

let updated = 0;
for (const row of rows) {
  const level = getCefrLevel(row.word, row.sourceLang);
  if (level) {
    await client.execute({
      sql: 'UPDATE "Word" SET cefrLevel = ? WHERE id = ?',
      args: [level, row.id],
    });
    updated++;
  }
}

console.log(`Updated ${updated} / ${rows.length} words.`);
await client.close();
