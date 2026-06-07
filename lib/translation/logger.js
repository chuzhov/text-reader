import { promises as fs } from 'fs';
import path from 'path';
import config from './config.js';

const logsDir = path.join(process.cwd(), 'logs');

export async function appendLog(userId, entry) {
  if (!config.logAiCalls) return;
  try {
    await fs.mkdir(logsDir, { recursive: true });
    const file = path.join(logsDir, `${userId}.jsonl`);
    const line = JSON.stringify({ ts: new Date().toISOString(), userId, ...entry }) + '\n';
    await fs.appendFile(file, line, 'utf8');
  } catch (err) {
    console.warn('[translation-logger] Failed to write log:', err.message);
  }
}
