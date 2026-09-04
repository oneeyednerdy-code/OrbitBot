import type { Env } from '../../types';
import { audit } from '../../repositories/audit';
import { recordSystemError } from '../../repositories/errors';
import { sendDiscordMessage } from '../../discord/messages';
import { nextRun } from '../scheduler/recurrence.js';
import { parseQuestionText, questionKey } from './questions.js';

const DEFAULT_QUESTION_TEXT = `What game could you play forever without getting bored?
What is one small thing that always improves your day?
Which fictional world would you move into for a month?
What is a hobby you would recommend to almost anyone?
What song can instantly change your mood?
What is the most useful thing you learned recently?
Which game deserves a sequel?
What is your comfort movie or show?
What snack disappears fastest in your house?
What is one skill you would love to master?
Which fictional character would make the best roommate?
What is the weirdest harmless fact you know?
What community tradition should we start here?
What is a game you wish more people talked about?
What is your favorite way to spend a completely free evening?
Which book, game, or show has stayed with you the longest?
What is a tiny victory you had this week?
What fictional villain had a point, even if their methods were terrible?
What is something you are looking forward to?
What would your perfect themed game night include?`;

const DISPATCH_LEASE_MS = 2 * 60_000;
const MAX_DISPATCH_ATTEMPTS = 5;

export const SAMPLE_QUESTION_BANKS = [
  { key: 'gamer', label: 'Gamer Questions', fileName: 'Gamer_Questions.txt', assetPath: '/question-banks/Gamer_Questions.txt' },
  { key: 'pop-culture', label: 'Pop Culture Questions', fileName: 'Pop_Culture_Questions.txt', assetPath: '/question-banks/Pop_Culture_Questions.txt' },
  { key: 'nerd', label: 'Nerd Questions', fileName: 'Nerd_Questions.txt', assetPath: '/question-banks/Nerd_Questions.txt' },
  { key: 'twitch-streamer', label: 'Twitch Streamer Questions', fileName: 'Twitch_Streamer_Questions.txt', assetPath: '/question-banks/Twitch_Streamer_Questions.txt' },
  { key: 'tabletop-rpg', label: 'Tabletop RPG Questions', fileName: 'Tabletop_RPG_Questions.txt', assetPath: '/question-banks/Tabletop_RPG_Questions.txt' },
  { key: 'sci-fi-fantasy', label: 'Sci-Fi and Fantasy Questions', fileName: 'Sci_Fi_Fantasy_Questions.txt', assetPath: '/question-banks/Sci_Fi_Fantasy_Questions.txt' },
  { key: 'horror', label: 'Horror Questions', fileName: 'Horror_Questions.txt', assetPath: '/question-banks/Horror_Questions.txt' },
  { key: 'anime-comics', label: 'Anime and Comics Questions', fileName: 'Anime_Comics_Questions.txt', assetPath: '/question-banks/Anime_Comics_Questions.txt' },
] as const;

export async function loadSampleQuestionBank(env: Env, sampleKey: string): Promise<{ fileName: string; text: string }> {
  const sample = SAMPLE_QUESTION_BANKS.find(item => item.key === sampleKey);
  if (!sample) throw new Error('invalid_sample_bank');
  const response = await env.ASSETS.fetch(new Request(`https://orbit.local${sample.assetPath}`));
  if (!response.ok) throw new Error('sample_bank_unavailable');
  return { fileName: sample.fileName, text: await response.text() };
}

export async function ensureDefaultQuestionBank(env: Env, guildId: string): Promise<number> {
  const active = await env.DB.prepare('SELECT id FROM community_engagement_banks WHERE guild_id=? AND active=1 LIMIT 1').bind(guildId).first<{ id: number }>();
  if (active?.id) return Number(active.id);

  let text = DEFAULT_QUESTION_TEXT;
  try {
    const asset = await env.ASSETS.fetch(new Request('https://orbit.local/questions/community-engagement.txt'));
    if (asset.ok) text = await asset.text();
  } catch {}
  const questions = parseQuestionText(text);
  const now = Date.now();
  let bankId = 0;
  try {
    const inserted = await env.DB.prepare('INSERT INTO community_engagement_banks(guild_id,file_name,uploaded_by,uploaded_at,active,question_count) VALUES(?,?,?,?,0,?)')
      .bind(guildId, 'community-engagement.txt', 'orbit-default', now, questions.length).run();
    bankId = Number(inserted.meta.last_row_id);
    await insertQuestions(env, guildId, bankId, questions, now);
    await env.DB.prepare('UPDATE community_engagement_banks SET active=1 WHERE id=? AND guild_id=?').bind(bankId, guildId).run();
  } catch {
    const current = await env.DB.prepare('SELECT id FROM community_engagement_banks WHERE guild_id=? AND active=1 LIMIT 1').bind(guildId).first<{ id: number }>();
    if (current?.id) return Number(current.id);
    throw new Error('default_question_bank_unavailable');
  }
  return bankId;
}

export async function createQuestionBank(env: Env, guildId: string, actorId: string, fileName: string, text: string): Promise<{ bankId: number; count: number }> {
  const questions = parseQuestionText(text);
  if (!questions.length) throw new Error('question_file_empty');
  if (questions.length > 2500) throw new Error('question_file_too_large');
  const now = Date.now();
  const inserted = await env.DB.prepare('INSERT INTO community_engagement_banks(guild_id,file_name,uploaded_by,uploaded_at,active,question_count) VALUES(?,?,?,?,0,?)')
    .bind(guildId, fileName.slice(0, 120) || 'questions.txt', actorId, now, questions.length).run();
  const bankId = Number(inserted.meta.last_row_id);
  await insertQuestions(env, guildId, bankId, questions, now);
  await env.DB.batch([
    env.DB.prepare('UPDATE community_engagement_banks SET active=0 WHERE guild_id=? AND active=1').bind(guildId),
    env.DB.prepare('UPDATE community_engagement_banks SET active=1 WHERE id=? AND guild_id=?').bind(bankId, guildId),
    env.DB.prepare(`INSERT INTO community_engagement_configs(guild_id,enabled,frequency,timezone,source_bank_id,updated_by,updated_at)
      VALUES(?,0,'weekly','UTC',?,?,?)
      ON CONFLICT(guild_id) DO UPDATE SET source_bank_id=excluded.source_bank_id,last_error=NULL,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .bind(guildId, bankId, actorId, now),
  ]);
  return { bankId, count: questions.length };
}

async function insertQuestions(env: Env, guildId: string, bankId: number, questions: Array<{ question_text: string; question_key: string; line_number: number }>, now: number): Promise<void> {
  for (let offset = 0; offset < questions.length; offset += 80) {
    const chunk = questions.slice(offset, offset + 80);
    await env.DB.batch(chunk.map(question => env.DB.prepare(`INSERT INTO community_engagement_questions(guild_id,bank_id,question_text,question_key,line_number,created_at) VALUES(?,?,?,?,?,?)`)
      .bind(guildId, bankId, question.question_text, question.question_key, question.line_number, now)));
  }
}

export async function engagementSweep(env: Env): Promise<void> {
  if (!env.JOBS) return;
  const now = Date.now();
  const due = await env.DB.prepare(`SELECT guild_id FROM community_engagement_configs
    WHERE enabled=1 AND next_post_at IS NOT NULL AND next_post_at<=?
      AND COALESCE(dispatch_lease_until,0)<=? AND dispatch_attempts<?
    ORDER BY next_post_at ASC LIMIT 100`).bind(now, now, MAX_DISPATCH_ATTEMPTS).all<{ guild_id: string }>();
  for (const row of due.results) await env.JOBS.send({ type: 'community-engagement-dispatch', guildId: String(row.guild_id) });
}

export async function dispatchEngagementQuestion(env: Env, guildId: string): Promise<void> {
  const now = Date.now();
  const claim = await env.DB.prepare(`UPDATE community_engagement_configs
    SET dispatch_lease_until=?,dispatch_attempts=dispatch_attempts+1,updated_at=?
    WHERE guild_id=? AND enabled=1 AND next_post_at IS NOT NULL AND next_post_at<=?
      AND COALESCE(dispatch_lease_until,0)<=? AND dispatch_attempts<?`)
    .bind(now + DISPATCH_LEASE_MS, now, guildId, now, now, MAX_DISPATCH_ATTEMPTS).run();
  if (!claim.meta.changes) return;

  try {
    const config = await env.DB.prepare('SELECT * FROM community_engagement_configs WHERE guild_id=?').bind(guildId).first<any>();
    if (!config?.channel_id || !config.source_bank_id) {
      await disableWithError(env, guildId, 'engagement_not_configured');
      return;
    }
    const question = await env.DB.prepare(`SELECT q.id,q.question_text,q.question_key,q.bank_id
      FROM community_engagement_questions q
      LEFT JOIN community_engagement_history h ON h.guild_id=q.guild_id AND h.question_key=q.question_key
      WHERE q.guild_id=? AND q.bank_id=? AND h.id IS NULL
      ORDER BY RANDOM() LIMIT 1`).bind(guildId, config.source_bank_id).first<any>();
    if (!question) {
      await disableWithError(env, guildId, 'question_bank_exhausted');
      await audit(env, guildId, null, 'community_engagement_exhausted', { bank_id: config.source_bank_id }, null);
      return;
    }

    const content = `**Question of the Day**\n\n${String(question.question_text)}`.slice(0, 2000);
    const nonce = `qe-${String(guildId).slice(-12)}-${Number(config.next_post_at).toString(36)}`.slice(0, 25);
    const response = await sendDiscordMessage(env, String(config.channel_id), { content, nonce, enforce_nonce: true } as any);
    if (!response.ok) {
      let detail: any = {};
      try { detail = await response.clone().json<any>(); } catch {}
      const errorCode = `discord_${response.status}`;
      await recordSystemError(env, guildId, '/channels/:channel/messages', 'POST', response.status, 'community_engagement_delivery_failed', { error_code: errorCode, message: detail?.message || null });
      if (response.status === 429 || response.status >= 500) throw new Error(errorCode);
      await disableWithError(env, guildId, errorCode);
      return;
    }
    let messageId: string | null = null;
    try { messageId = String((await response.clone().json<any>()).id || '') || null; } catch {}
    await env.DB.prepare(`INSERT OR IGNORE INTO community_engagement_history(guild_id,question_key,question_text,source_bank_id,channel_id,discord_message_id,posted_at)
      VALUES(?,?,?,?,?,?,?)`).bind(guildId, question.question_key, question.question_text, question.bank_id, config.channel_id, messageId, now).run();
    const next = nextRun(Number(config.next_post_at), String(config.frequency || 'weekly'), String(config.timezone || 'UTC'));
    await env.DB.prepare(`UPDATE community_engagement_configs
      SET next_post_at=?,last_posted_at=?,last_question=?,last_message_id=?,last_error=NULL,
          dispatch_lease_until=NULL,dispatch_attempts=0,updated_at=? WHERE guild_id=?`)
      .bind(next, now, question.question_text, messageId, now, guildId).run();
    await audit(env, guildId, null, 'community_engagement_question_posted', { channel_id: config.channel_id, bank_id: question.bank_id, question_id: question.id, frequency: config.frequency }, null);
  } catch (error) {
    await env.DB.prepare('UPDATE community_engagement_configs SET dispatch_lease_until=NULL,updated_at=? WHERE guild_id=?').bind(Date.now(), guildId).run();
    throw error;
  }
}

async function disableWithError(env: Env, guildId: string, error: string): Promise<void> {
  await env.DB.prepare(`UPDATE community_engagement_configs SET enabled=0,last_error=?,dispatch_lease_until=NULL,updated_at=? WHERE guild_id=?`)
    .bind(error, Date.now(), guildId).run();
}

export function normalizeUploadedFileName(value: string): string {
  const name = String(value || 'questions.txt').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  return name.toLowerCase().endsWith('.txt') ? name : `${name}.txt`;
}

export { parseQuestionText, questionKey };
