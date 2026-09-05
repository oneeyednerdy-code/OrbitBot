export const MAX_SOCIAL_IMAGE_UPLOAD_BYTES = 10_000_000;
export const SOCIAL_IMAGE_UPLOAD_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_SOCIAL_IMAGES = 4;
export const ALLOWED_SOCIAL_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

export function normalizeSocialImageContentType(raw: unknown, fileName = ''): string | null {
  const supplied = String(raw || '').split(';', 1)[0].trim().toLowerCase();
  if (ALLOWED_SOCIAL_IMAGE_TYPES.includes(supplied as typeof ALLOWED_SOCIAL_IMAGE_TYPES[number])) return supplied;
  if (supplied && supplied !== 'application/octet-stream') return null;
  const name = fileName.toLowerCase();
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.webp')) return 'image/webp';
  return null;
}
