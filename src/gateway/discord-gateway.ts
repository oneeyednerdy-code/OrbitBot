import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../types';
import { discord } from '../discord/client';
import { recordSystemError } from '../repositories/errors';
import { sha256 } from '../security/crypto';
import { recordMessageAndCheckHoneypot } from '../modules/moderation/honeypot';
import { awardMessageXp } from '../modules/leveling/service';
import { runAutomations } from '../modules/automation/engine';
import { shouldHandleAutomationMessage } from '../modules/automation/policy.js';
import { handleCommunityMessage, handleMemberAdd, handleMemberRemove } from '../modules/community/service';
import { shieldMemberJoin, shieldMessage } from '../modules/shield/service';
import { handleCountingMessage } from '../modules/counting/service';

const GATEWAY_IMPLEMENTATION = 'alpha56-supervised-gateway-v3';
const GATEWAY_INTENTS = 33283;
const GATEWAY_INTENT_MANIFEST = ['GUILDS', 'GUILD_MEMBERS', 'GUILD_MESSAGES', 'MESSAGE_CONTENT'];
const IDENTIFY_BUDGET_FLOOR = 5;
const FORCE_RETRY_COOLDOWN_MS = 5 * 60_000;
const MAX_RECONNECT_DELAY_MS = 15 * 60_000;

const TERMINAL_CLOSE_CODES = new Map<number, string>([
  [4004, 'authentication_failed'],
  [4010, 'invalid_shard'],
  [4011, 'sharding_required'],
  [4012, 'invalid_api_version'],
  [4013, 'invalid_intents'],
  [4014, 'disallowed_intents'],
]);

type ConnectionMode = 'identify' | 'resume';
type CloseDisposition = 'identify' | 'resume' | null;

type PersistedGatewayState = {
  implementation?: string;
  token_fingerprint?: string;
  session_id?: string | null;
  resume_gateway_url?: string | null;
  sequence?: number | null;
  halt_reason?: string | null;
  halted_at?: number | null;
  reconnect_attempts?: number;
  identify_failures?: number;
  next_attempt_at?: number;
  last_identify_at?: number;
  last_force_retry_at?: number;
  session_start_remaining?: number | null;
  session_start_total?: number | null;
  session_start_reset_at?: number | null;
  intents?: number;
  last_heartbeat_at?: number | null;
  last_heartbeat_ack_at?: number | null;
  heartbeat_misses?: number;
};

export class DiscordGateway extends DurableObject<Env> {
  private socket: WebSocket | null = null;
  private heartbeatMs = 45_000;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatAcked = true;
  private sequence: number | null = null;
  private sessionId: string | null = null;
  private resumeGatewayUrl: string | null = null;
  private haltReason: string | null = null;
  private haltedAt: number | null = null;
  private reconnectAttempts = 0;
  private identifyFailures = 0;
  private nextAttemptAt = 0;
  private lastIdentifyAt = 0;
  private lastForceRetryAt = 0;
  private sessionStartRemaining: number | null = null;
  private sessionStartTotal: number | null = null;
  private sessionStartResetAt: number | null = null;
  private lastHeartbeatAt: number | null = null;
  private lastHeartbeatAckAt: number | null = null;
  private heartbeatMisses = 0;
  private tokenFingerprint = '';
  private hydrated = false;
  private connectGeneration = 0;
  private connectionAuthenticated = false;
  private closeDisposition: CloseDisposition = null;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/start') {
      const force = url.searchParams.get('force') === '1';
      const result = await this.start(force);
      return Response.json(result, { status: result.ok ? 200 : result.state === 'cooldown' ? 429 : 503 });
    }
    if (url.pathname === '/status') {
      await this.hydrate();
      return Response.json(this.status());
    }
    return new Response('not found', { status: 404 });
  }

  async alarm(): Promise<void> {
    this.reconnectTimer = null;
    await this.start(false);
  }

  async start(force = false): Promise<any> {
    await this.hydrate();

    if (force) {
      const now = Date.now();
      if (now - this.lastForceRetryAt < FORCE_RETRY_COOLDOWN_MS) {
        return {
          ok: false,
          state: 'cooldown',
          reason: 'force_retry_cooldown',
          retry_after_ms: FORCE_RETRY_COOLDOWN_MS - (now - this.lastForceRetryAt),
        };
      }
      this.lastForceRetryAt = now;
      this.haltReason = null;
      this.haltedAt = null;
      this.nextAttemptAt = 0;
      await this.persist();
    }

    if (this.haltReason) return { ok: false, ...this.status() };
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return { ok: true, ...this.status() };

    const now = Date.now();
    if (this.nextAttemptAt > now) {
      await this.ensureAlarm(this.nextAttemptAt);
      return { ok: true, ...this.status() };
    }

    await this.connectGateway();
    return { ok: !this.haltReason, ...this.status() };
  }

  private async hydrate(): Promise<void> {
    if (this.hydrated) return;
    const fingerprint = (await sha256(this.env.DISCORD_BOT_TOKEN)).slice(0, 24);
    const saved = (await this.ctx.storage.get<PersistedGatewayState>('gateway_state')) ?? {};

    // A changed token or a new gateway implementation is a safe recovery boundary.
    if (saved.token_fingerprint !== fingerprint || saved.implementation !== GATEWAY_IMPLEMENTATION) {
      this.tokenFingerprint = fingerprint;
      this.hydrated = true;
      await this.persist();
      return;
    }

    this.tokenFingerprint = fingerprint;
    this.sessionId = saved.session_id ?? null;
    this.resumeGatewayUrl = saved.resume_gateway_url ?? null;
    this.sequence = saved.sequence ?? null;
    this.haltReason = saved.halt_reason ?? null;
    this.haltedAt = saved.halted_at ?? null;
    this.reconnectAttempts = saved.reconnect_attempts ?? 0;
    this.identifyFailures = saved.identify_failures ?? 0;
    this.nextAttemptAt = saved.next_attempt_at ?? 0;
    this.lastIdentifyAt = saved.last_identify_at ?? 0;
    this.lastForceRetryAt = saved.last_force_retry_at ?? 0;
    this.sessionStartRemaining = saved.session_start_remaining ?? null;
    this.sessionStartTotal = saved.session_start_total ?? null;
    this.sessionStartResetAt = saved.session_start_reset_at ?? null;
    this.lastHeartbeatAt = saved.last_heartbeat_at ?? null;
    this.lastHeartbeatAckAt = saved.last_heartbeat_ack_at ?? null;
    this.heartbeatMisses = saved.heartbeat_misses ?? 0;
    this.hydrated = true;
  }

  private async persist(): Promise<void> {
    const state: PersistedGatewayState = {
      implementation: GATEWAY_IMPLEMENTATION,
      token_fingerprint: this.tokenFingerprint,
      session_id: this.sessionId,
      resume_gateway_url: this.resumeGatewayUrl,
      sequence: this.sequence,
      halt_reason: this.haltReason,
      halted_at: this.haltedAt,
      reconnect_attempts: this.reconnectAttempts,
      identify_failures: this.identifyFailures,
      next_attempt_at: this.nextAttemptAt,
      last_identify_at: this.lastIdentifyAt,
      last_force_retry_at: this.lastForceRetryAt,
      session_start_remaining: this.sessionStartRemaining,
      session_start_total: this.sessionStartTotal,
      session_start_reset_at: this.sessionStartResetAt,
      intents: GATEWAY_INTENTS,
      last_heartbeat_at: this.lastHeartbeatAt,
      last_heartbeat_ack_at: this.lastHeartbeatAckAt,
      heartbeat_misses: this.heartbeatMisses,
    };
    await this.ctx.storage.put('gateway_state', state);
  }

  private status() {
    let state = 'idle';
    if (this.haltReason) state = 'halted';
    else if (this.socket?.readyState === WebSocket.CONNECTING) state = 'connecting';
    else if (this.socket?.readyState === WebSocket.OPEN) state = this.connectionAuthenticated ? 'ready' : 'handshaking';
    else if (this.nextAttemptAt > Date.now()) state = 'backoff';

    return {
      state,
      halt_reason: this.haltReason,
      halted_at: this.haltedAt,
      reconnect_attempts: this.reconnectAttempts,
      identify_failures: this.identifyFailures,
      next_attempt_at: this.nextAttemptAt || null,
      session_start_remaining: this.sessionStartRemaining,
      session_start_total: this.sessionStartTotal,
      session_start_reset_at: this.sessionStartResetAt,
      intents: GATEWAY_INTENTS,
      intent_manifest: GATEWAY_INTENT_MANIFEST,
      last_heartbeat_at: this.lastHeartbeatAt,
      last_heartbeat_ack_at: this.lastHeartbeatAckAt,
      heartbeat_misses: this.heartbeatMisses,
      resumable_session: Boolean(this.sessionId && this.resumeGatewayUrl && this.sequence != null),
    };
  }

  private async connectGateway(): Promise<void> {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;

    const mode: ConnectionMode = this.canResume() ? 'resume' : 'identify';
    let gatewayUrl = this.resumeGatewayUrl || 'wss://gateway.discord.gg';

    if (mode === 'identify') {
      const preflight = await this.preflightIdentify();
      if (!preflight.ok) return;
      gatewayUrl = preflight.url;
    }

    const url = new URL(gatewayUrl);
    url.searchParams.set('v', '10');
    url.searchParams.set('encoding', 'json');

    const ws = new WebSocket(url.toString());
    const generation = ++this.connectGeneration;
    this.socket = ws;
    this.connectionAuthenticated = false;
    this.closeDisposition = null;
    this.heartbeatAcked = true;
    this.handshakeTimer = setTimeout(() => {
      if (this.socket !== ws || generation !== this.connectGeneration || this.connectionAuthenticated) return;
      this.closeDisposition = this.canResume() ? 'resume' : 'identify';
      try { ws.close(4000, 'gateway handshake timeout'); } catch {}
    }, 30_000);

    ws.addEventListener('message', event => {
      this.ctx.waitUntil(this.onMessage(String(event.data), generation, mode, ws));
    });
    ws.addEventListener('close', event => {
      this.ctx.waitUntil(this.onClose(event, generation, mode, ws));
    });
    ws.addEventListener('error', () => {
      if (this.socket !== ws || generation !== this.connectGeneration) return;
      // Do not schedule a second reconnect here. Closing the socket funnels all
      // recovery through the close handler exactly once.
      this.closeDisposition = this.canResume() ? 'resume' : 'identify';
      try { ws.close(4000, 'transport error'); } catch {}
    });
  }

  private async preflightIdentify(): Promise<{ ok: true; url: string } | { ok: false }> {
    const sinceLastIdentify = Date.now() - this.lastIdentifyAt;
    if (this.lastIdentifyAt && sinceLastIdentify < 5_000) {
      await this.deferReconnect('identify_concurrency_guard', 5_000 - sinceLastIdentify + this.jitter(1_000));
      return { ok: false };
    }

    let response: Response;
    try {
      response = await discord(this.env, '/gateway/bot');
    } catch (error) {
      await this.deferReconnect('gateway_preflight_network', this.backoffDelay(false));
      await recordSystemError(this.env, null, '/gateway/bot', 'GET', 502, 'gateway_preflight_network', { message: String(error) });
      return { ok: false };
    }

    if (response.status === 401 || response.status === 403) {
      await this.halt('invalid_bot_token', response.status, 'Discord rejected the bot token before a Gateway connection was opened.');
      return { ok: false };
    }

    if (response.status === 429) {
      let retryMs = 60_000;
      try {
        const body = await response.clone().json<any>();
        retryMs = Math.max(5_000, Number(body?.retry_after || 60) * 1000);
      } catch {}
      await this.deferReconnect('gateway_preflight_rate_limited', retryMs + this.jitter(2_500));
      return { ok: false };
    }

    if (!response.ok) {
      await this.deferReconnect('gateway_preflight_failed', this.backoffDelay(false));
      await recordSystemError(this.env, null, '/gateway/bot', 'GET', response.status, 'gateway_preflight_failed', { status: response.status });
      return { ok: false };
    }

    const body = await response.json<any>();
    const limits = body?.session_start_limit || {};
    this.sessionStartRemaining = Number.isFinite(Number(limits.remaining)) ? Number(limits.remaining) : null;
    this.sessionStartTotal = Number.isFinite(Number(limits.total)) ? Number(limits.total) : null;
    const resetAfter = Number(limits.reset_after || 0);
    this.sessionStartResetAt = resetAfter > 0 ? Date.now() + resetAfter : null;

    if (this.sessionStartRemaining != null && this.sessionStartRemaining <= IDENTIFY_BUDGET_FLOOR) {
      const waitUntil = (this.sessionStartResetAt || Date.now() + 60 * 60_000) + this.jitter(5_000);
      this.nextAttemptAt = waitUntil;
      await this.persist();
      await this.ensureAlarm(waitUntil);
      await recordSystemError(this.env, null, '/gateway/bot', 'GET', 429, 'gateway_identify_budget_protected', {
        remaining: this.sessionStartRemaining,
        total: this.sessionStartTotal,
        reset_at: this.sessionStartResetAt,
      });
      return { ok: false };
    }

    await this.persist();
    return { ok: true, url: String(body?.url || 'wss://gateway.discord.gg') };
  }

  private async onMessage(raw: string, generation: number, mode: ConnectionMode, ws: WebSocket): Promise<void> {
    if (generation !== this.connectGeneration || this.socket !== ws) return;

    let packet: any;
    try { packet = JSON.parse(raw); }
    catch {
      this.closeDisposition = this.canResume() ? 'resume' : 'identify';
      try { ws.close(4002, 'decode error'); } catch {}
      return;
    }

    if (packet.s != null) this.sequence = Number(packet.s);

    if (packet.op === 10) {
      this.heartbeatMs = Math.max(1_000, Number(packet.d?.heartbeat_interval || 45_000));
      this.scheduleHeartbeat(true, generation, ws);
      if (mode === 'resume' && this.canResume()) this.resume();
      else await this.identify();
      return;
    }

    if (packet.op === 11) {
      this.heartbeatAcked = true;
      this.lastHeartbeatAckAt = Date.now();
      this.heartbeatMisses = 0;
      await this.persist();
      return;
    }

    if (packet.op === 1) {
      this.sendHeartbeat(generation, ws);
      return;
    }

    if (packet.op === 7) {
      this.closeDisposition = this.canResume() ? 'resume' : 'identify';
      try { ws.close(4000, 'discord requested reconnect'); } catch {}
      return;
    }

    if (packet.op === 9) {
      if (packet.d === true && this.canResume()) this.closeDisposition = 'resume';
      else {
        this.clearSession();
        this.closeDisposition = 'identify';
      }
      await this.persist();
      try { ws.close(4000, 'invalid session'); } catch {}
      return;
    }

    if (packet.op !== 0) return;

    if (packet.t === 'READY') {
      this.clearHandshake();
      this.connectionAuthenticated = true;
      this.sessionId = String(packet.d?.session_id || '') || null;
      this.resumeGatewayUrl = String(packet.d?.resume_gateway_url || '') || null;
      this.reconnectAttempts = 0;
      this.identifyFailures = 0;
      this.nextAttemptAt = 0;
      if (this.sessionStartRemaining != null) this.sessionStartRemaining = Math.max(0, this.sessionStartRemaining - 1);
      await this.persist();
      return;
    }

    if (packet.t === 'RESUMED') {
      this.clearHandshake();
      this.connectionAuthenticated = true;
      this.reconnectAttempts = 0;
      this.nextAttemptAt = 0;
      await this.persist();
      return;
    }

    try {
      if (packet.t === 'MESSAGE_CREATE') {
        await shieldMessage(this.env, packet.d);
        await recordMessageAndCheckHoneypot(this.env, packet.d);
        await awardMessageXp(this.env, packet.d);
        await handleCountingMessage(this.env, packet.d);
        await handleCommunityMessage(this.env, packet.d);
        if (shouldHandleAutomationMessage(packet.d)) {
          await runAutomations(this.env, packet.d.guild_id, 'message_create', {
            event_id: packet.d.id,
            user_id: packet.d.author.id,
            channel_id: packet.d.channel_id,
            role_ids: packet.d.member?.roles || [],
          });
        }
      }
      if (packet.t === 'GUILD_MEMBER_ADD') {
        try { await shieldMemberJoin(this.env, packet.d); }
        catch (error) {
          await recordSystemError(this.env, packet.d?.guild_id || null, '/gateway/dispatch/shield-member-join', 'EVENT', 500, 'shield_member_join_failed', { message: error instanceof Error ? error.message : String(error) });
        }
        await handleMemberAdd(this.env, packet.d);
      }
      if (packet.t === 'GUILD_MEMBER_REMOVE') await handleMemberRemove(this.env, packet.d);
    } catch (error) {
      await recordSystemError(this.env, packet.d?.guild_id || null, '/gateway/dispatch', 'EVENT', 500, 'gateway_dispatch_failed', {
        event_type: String(packet.t || 'unknown'),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async identify(): Promise<void> {
    const now = Date.now();
    this.lastIdentifyAt = now;
    await this.persist();
    this.send({
      op: 2,
      d: {
        token: this.env.DISCORD_BOT_TOKEN,
        intents: GATEWAY_INTENTS,
        properties: { os: 'linux', browser: 'orbit', device: 'orbit' },
      },
    });
  }

  private resume(): void {
    if (!this.canResume()) return;
    this.send({
      op: 6,
      d: {
        token: this.env.DISCORD_BOT_TOKEN,
        session_id: this.sessionId,
        seq: this.sequence,
      },
    });
  }

  private scheduleHeartbeat(initial: boolean, generation: number, ws: WebSocket): void {
    this.clearHeartbeat();
    const delay = initial ? Math.floor(Math.random() * this.heartbeatMs) : this.heartbeatMs;
    this.heartbeatTimer = setTimeout(() => this.sendHeartbeat(generation, ws), Math.max(250, delay));
  }

  private sendHeartbeat(generation: number, ws: WebSocket): void {
    if (generation !== this.connectGeneration || this.socket !== ws || ws.readyState !== WebSocket.OPEN) return;
    if (!this.heartbeatAcked) {
      this.heartbeatMisses += 1;
      this.lastHeartbeatAt = Date.now();
      this.ctx.waitUntil(this.persist());
      this.closeDisposition = this.canResume() ? 'resume' : 'identify';
      try { ws.close(4000, 'heartbeat ack timeout'); } catch {}
      return;
    }
    this.heartbeatAcked = false;
    this.lastHeartbeatAt = Date.now();
    this.ctx.waitUntil(this.persist());
    this.send({ op: 1, d: this.sequence });
    this.scheduleHeartbeat(false, generation, ws);
  }

  private send(value: any): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(value));
  }

  private async onClose(event: CloseEvent, generation: number, mode: ConnectionMode, ws: WebSocket): Promise<void> {
    if (generation !== this.connectGeneration || this.socket !== ws) return;

    this.clearHeartbeat();
    this.clearHandshake();
    this.socket = null;
    const wasAuthenticated = this.connectionAuthenticated;
    this.connectionAuthenticated = false;

    const terminalReason = TERMINAL_CLOSE_CODES.get(event.code);
    if (terminalReason) {
      await this.halt(terminalReason, event.code, `Discord closed the Gateway with terminal code ${event.code}.`);
      return;
    }

    if (mode === 'identify' && !wasAuthenticated) this.identifyFailures += 1;
    this.reconnectAttempts += 1;

    let disposition = this.closeDisposition;
    this.closeDisposition = null;

    if (event.code === 1000 || event.code === 1001 || event.code === 4007 || event.code === 4009) {
      this.clearSession();
      disposition = 'identify';
    }

    if (!disposition) disposition = this.canResume() ? 'resume' : 'identify';
    if (disposition === 'identify') this.clearSession();

    await this.persist();
    const invalidSessionDelay = event.code === 4000 && event.reason === 'invalid session' ? 1_000 + this.jitter(4_000) : null;
    const delay = invalidSessionDelay ?? this.backoffDelay(mode === 'identify' && !wasAuthenticated, event.code === 4008);
    await this.deferReconnect(`gateway_close_${event.code || 'unknown'}`, delay);
  }

  private canResume(): boolean {
    return Boolean(this.sessionId && this.resumeGatewayUrl && this.sequence != null);
  }

  private clearSession(): void {
    this.sessionId = null;
    this.resumeGatewayUrl = null;
    this.sequence = null;
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private clearHandshake(): void {
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    this.handshakeTimer = null;
  }

  private backoffDelay(failedIdentify: boolean, rateLimited = false): number {
    if (rateLimited) return 60_000 + this.jitter(15_000);
    const attempts = failedIdentify ? Math.max(1, this.identifyFailures) : Math.max(1, this.reconnectAttempts);
    const base = failedIdentify ? 15_000 : 2_000;
    const exponential = Math.min(MAX_RECONNECT_DELAY_MS, base * 2 ** Math.min(attempts - 1, 8));
    return exponential + this.jitter(Math.min(10_000, Math.floor(exponential * 0.2)));
  }

  private jitter(max: number): number {
    return max <= 0 ? 0 : Math.floor(Math.random() * max);
  }

  private async deferReconnect(reason: string, delayMs: number): Promise<void> {
    const delay = Math.max(1_000, Math.min(MAX_RECONNECT_DELAY_MS, delayMs));
    this.nextAttemptAt = Date.now() + delay;
    await this.persist();
    await this.ensureAlarm(this.nextAttemptAt);

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.start(false);
    }, delay);

    console.warn('orbit gateway reconnect deferred', { reason, delay_ms: delay, next_attempt_at: this.nextAttemptAt });
  }

  private async ensureAlarm(when: number): Promise<void> {
    try { await this.ctx.storage.setAlarm(when); } catch {}
  }

  private async halt(reason: string, status: number, detail: string): Promise<void> {
    this.haltReason = reason;
    this.haltedAt = Date.now();
    this.nextAttemptAt = 0;
    this.clearHeartbeat();
    this.clearHandshake();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    try { await this.ctx.storage.deleteAlarm(); } catch {}
    await this.persist();
    await recordSystemError(this.env, null, '/gateway', 'WS', status, `gateway_${reason}`, { close_or_http_status: status, detail });
  }
}
