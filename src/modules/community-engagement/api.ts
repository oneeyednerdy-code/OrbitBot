import type { Env } from '../../types';
import { json } from '../../http/responses';
import { audit } from '../../repositories/audit';
import { loadGuildResources, validateChannelIds } from '../../discord/guild-resources';
import { createQuestionBank, ensureDefaultQuestionBank, loadSampleQuestionBank, normalizeUploadedFileName, SAMPLE_QUESTION_BANKS } from './service';
import { validEngagementFrequency } from './questions.js';

export async function communityEngagementApi(request: Request, env: Env, guildId: string, actorId: string): Promise<Response> {
  if (request.method === 'GET') {
    const bankId = await ensureDefaultQuestionBank(env, guildId);
    await env.DB.prepare(`INSERT INTO community_engagement_configs(guild_id,source_bank_id,updated_at)
      VALUES(?,?,?) ON CONFLICT(guild_id) DO UPDATE SET source_bank_id=COALESCE(community_engagement_configs.source_bank_id,excluded.source_bank_id)`)
      .bind(guildId, bankId, Date.now()).run();
    const [config, bank, stats, history] = await Promise.all([
      env.DB.prepare('SELECT * FROM community_engagement_configs WHERE guild_id=?').bind(guildId).first(),
      env.DB.prepare('SELECT id,file_name,question_count,uploaded_at,active FROM community_engagement_banks WHERE guild_id=? AND active=1 LIMIT 1').bind(guildId).first(),
      env.DB.prepare(`SELECT COUNT(q.id) AS total, SUM(CASE WHEN h.id IS NULL THEN 1 ELSE 0 END) AS remaining,
        SUM(CASE WHEN h.id IS NOT NULL THEN 1 ELSE 0 END) AS used
        FROM community_engagement_questions q
        LEFT JOIN community_engagement_history h ON h.guild_id=q.guild_id AND h.question_key=q.question_key
        WHERE q.guild_id=? AND q.bank_id=?`).bind(guildId, bankId).first(),
      env.DB.prepare('SELECT question_text,posted_at,channel_id,discord_message_id FROM community_engagement_history WHERE guild_id=? ORDER BY posted_at DESC LIMIT 50').bind(guildId).all(),
    ]);
    return json({ config: config ?? {}, bank: bank ?? {}, stats: stats ?? { total: 0, remaining: 0, used: 0 }, history: history.results, frequencies: ['daily', 'weekly', 'biweekly', 'monthly'], sample_banks: SAMPLE_QUESTION_BANKS.map(({ key, label, fileName }) => ({ key, label, file_name: fileName })) });
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const uploaded: any = form.get('file');
    if (!uploaded || typeof uploaded.text !== 'function') return json({ error: 'question_file_required', detail: 'Choose a plain-text .txt question file.' }, 400);
    if (Number(uploaded.size || 0) > 250_000) return json({ error: 'question_file_too_large', detail: 'Question files must be 250 KB or smaller.' }, 413);
    const fileName = String(uploaded.name || 'questions.txt');
    if (!fileName.toLowerCase().endsWith('.txt')) return json({ error: 'question_file_type', detail: 'Upload a .txt file with one question per line.' }, 400);
    try {
      const result = await createQuestionBank(env, guildId, actorId, normalizeUploadedFileName(fileName), await uploaded.text());
      await audit(env, guildId, null, 'community_engagement_bank_uploaded', { bank_id: result.bankId, question_count: result.count, file_name: normalizeUploadedFileName(fileName) }, actorId);
      return json({ ok: true, bank_id: result.bankId, question_count: result.count });
    } catch (error: any) {
      const code = String(error?.message || 'question_file_invalid');
      const invalidLine = code.startsWith('Question on line ');
      const errorCode = invalidLine ? 'question_file_invalid' : code;
      const detail = code === 'question_file_empty' ? 'The file does not contain any non-empty lines.' : code === 'question_file_too_large' ? 'The file can contain at most 2,500 questions.' : code;
      return json({ error: errorCode, detail }, 400);
    }
  }

  let body: any;
  try { body = await request.json<any>(); } catch { return json({ error: 'invalid_json' }, 400); }
  const op = String(body.op || 'save');
  if (op === 'load_sample') {
    try {
      const sample = await loadSampleQuestionBank(env, String(body.sample_key || ''));
      const result = await createQuestionBank(env, guildId, actorId, sample.fileName, sample.text);
      await audit(env, guildId, null, 'community_engagement_sample_loaded', { bank_id: result.bankId, question_count: result.count, sample_key: String(body.sample_key || '') }, actorId);
      return json({ ok: true, bank_id: result.bankId, question_count: result.count });
    } catch (error: any) {
      const code = String(error?.message || 'sample_bank_unavailable');
      const detail = code === 'invalid_sample_bank' ? 'Choose one of the available sample question banks.' : 'That sample question bank is not available in this build.';
      return json({ error: code, detail }, 400);
    }
  }
  if (op !== 'save') return json({ error: 'invalid_operation' }, 400);
  const enabled = Boolean(body.enabled);
  const channelId = String(body.channel_id || '');
  const frequency = String(body.frequency || 'weekly');
  const timezone = String(body.timezone || 'UTC');
  const nextPostAt = body.next_post_at == null || body.next_post_at === '' ? null : Number(body.next_post_at);
  if (!validEngagementFrequency(frequency)) return json({ error: 'invalid_frequency', detail: 'Choose daily, weekly, every two weeks, or monthly.' }, 400);
  if (enabled && !/^\d{16,20}$/.test(channelId)) return json({ error: 'invalid_channel', detail: 'Select a Discord channel for the question posts.' }, 400);
  if (enabled && (!Number.isFinite(nextPostAt) || Number(nextPostAt) <= 0)) return json({ error: 'invalid_next_post', detail: 'Choose the date and time for the next question.' }, 400);
  if (!validTimeZone(timezone)) return json({ error: 'invalid_timezone', detail: 'The selected timezone is not valid.' }, 400);
  if (channelId) {
    const resources = await loadGuildResources(env, guildId, { channels: true });
    if (!resources.ok) return json(resources, resources.status);
    const invalid = validateChannelIds(resources, [channelId]);
    if (invalid) return json(invalid, invalid.status);
  }
  const current = await env.DB.prepare('SELECT source_bank_id FROM community_engagement_configs WHERE guild_id=?').bind(guildId).first<any>();
  const defaultBankId = await ensureDefaultQuestionBank(env, guildId);
  const sourceBankId = Number(body.source_bank_id || current?.source_bank_id || defaultBankId);
  const bank = await env.DB.prepare('SELECT id FROM community_engagement_banks WHERE id=? AND guild_id=? AND active=1').bind(sourceBankId, guildId).first<any>();
  if (!bank) return json({ error: 'invalid_question_bank', detail: 'The selected question bank is not available for this server.' }, 400);
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO community_engagement_configs(guild_id,enabled,channel_id,frequency,timezone,next_post_at,source_bank_id,last_error,updated_by,updated_at)
    VALUES(?,?,?,?,?,?,?,NULL,?,?)
    ON CONFLICT(guild_id) DO UPDATE SET enabled=excluded.enabled,channel_id=excluded.channel_id,frequency=excluded.frequency,
      timezone=excluded.timezone,next_post_at=excluded.next_post_at,source_bank_id=excluded.source_bank_id,last_error=NULL,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .bind(guildId, enabled ? 1 : 0, channelId || null, frequency, timezone, nextPostAt, sourceBankId, actorId, now).run();
  await audit(env, guildId, null, 'community_engagement_config_saved', { enabled, channel_id: channelId || null, frequency, timezone, next_post_at: nextPostAt, bank_id: sourceBankId }, actorId);
  return json({ ok: true });
}

function validTimeZone(value: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(); return true; } catch { return false; }
}
