export const MAX_SHORT_VIDEO_UPLOAD_BYTES = 95_000_000;
export const SHORT_VIDEO_UPLOAD_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const ALLOWED_SHORT_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;

export function normalizeShortVideoContentType(raw: unknown, fileName = ''): string | null {
  const supplied = String(raw || '').split(';', 1)[0].trim().toLowerCase();
  if (ALLOWED_SHORT_VIDEO_TYPES.includes(supplied as typeof ALLOWED_SHORT_VIDEO_TYPES[number])) return supplied;
  if (supplied && supplied !== 'application/octet-stream') return null;
  const name = fileName.toLowerCase();
  if (name.endsWith('.mov')) return 'video/quicktime';
  if (name.endsWith('.webm')) return 'video/webm';
  if (name.endsWith('.mp4') || name.endsWith('.m4v')) return 'video/mp4';
  return null;
}
