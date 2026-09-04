export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ORIGIN: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_BOT_TOKEN: string;
  DISCORD_PUBLIC_KEY: string;
  SESSION_SECRET: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  TURNSTILE_HOSTNAMES: string;
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
  YOUTUBE_API_KEY?: string;
  YOUTUBE_CLIENT_ID?: string;
  YOUTUBE_CLIENT_SECRET?: string;
  THREADS_CLIENT_ID?: string;
  THREADS_CLIENT_SECRET?: string;
  SOCIAL_CREDENTIAL_KEY?: string;
  TIKTOK_CLIENT_KEY?: string;
  TIKTOK_CLIENT_SECRET?: string;
  INSTAGRAM_CLIENT_ID?: string;
  INSTAGRAM_CLIENT_SECRET?: string;
  ORBIT_OPERATOR_USER_IDS?: string;
  CACHE?: KVNamespace;
  STORAGE?: R2Bucket;
  JOBS?: Queue<OrbitJob>;
  GATEWAY: DurableObjectNamespace;
}

export type OrbitJob =
  | { type: 'scheduled-post-dispatch'; scheduledPostId: number }
  | { type: 'diagnostic-sweep'; guildId: string }
  | { type: 'audit-log-dispatch'; auditEventId: number }
  | { type: 'social-dispatch'; socialPostId: number }
  | { type: 'channel-manager-execute'; jobId: number }
  | { type: 'community-engagement-dispatch'; guildId: string }
  | { type: 'short-video-dispatch'; shortVideoPostId: number }
  | { type: 'ticket-open-dispatch'; guildId: string; userId: string; categoryId: number; answers: Record<string,string>; interactionId: string; interactionToken: string; username: string }
  | { type: 'ticket-action-dispatch'; guildId: string; ticketId: number; action: 'close' | 'delete'; reason: string; actorId: string; actorRoleIds: string[]; actorPermissions: string; channelId: string; interactionId: string; interactionToken: string };

export interface SessionRow {
  id: string;
  user_id: string;
  username: string;
  avatar: string | null;
  access_token: string;
  refresh_token: string | null;
  oauth_scope: string | null;
  token_type: string | null;
  csrf_token: string;
  expires_at: number;
  session_expires_at: number | null;
  created_at: number;
}

export interface GuildConfigRow {
  guild_id: string;
  guild_name: string | null;
  rules_role_id: string | null;
  verified_role_id: string | null;
  combined_role_id: string | null;
  remove_combined_when_invalid: number;
  updated_by: string;
  updated_at: number;
  admin_log_channel_id: string | null;
  post_audit_events: number;
  notify_combined_granted: number;
  notify_combined_removed: number;
  notify_rules_granted: number;
  notify_verified_granted: number;
}
