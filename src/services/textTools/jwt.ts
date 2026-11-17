import { base64UrlDecode } from './base64';

function parseJsonPart(raw: string, label: string): unknown {
  let decoded: string;
  try {
    decoded = base64UrlDecode(raw);
  } catch {
    throw new Error(`Invalid ${label}: not valid Base64URL.`);
  }
  try {
    return JSON.parse(decoded);
  } catch {
    throw new Error(`Invalid ${label}: not valid JSON.`);
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.max(1, Math.round(Math.abs(ms) / 1000));
  if (seconds < 60) {
    return seconds === 1 ? '1 second' : `${seconds} seconds`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  const days = Math.round(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

function claimLine(name: string, value: unknown, nowMs: number): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const atMs = value * 1000;
  const iso = new Date(atMs).toISOString();
  let status: string;
  if (name === 'exp') {
    status = nowMs >= atMs ? `expired ${formatDuration(nowMs - atMs)} ago` : `valid for ${formatDuration(atMs - nowMs)}`;
  } else if (name === 'nbf') {
    status = nowMs < atMs ? 'not valid yet' : `active for ${formatDuration(nowMs - atMs)}`;
  } else {
    // iat
    status = nowMs >= atMs ? `${formatDuration(nowMs - atMs)} ago` : `in ${formatDuration(atMs - nowMs)}`;
  }
  return `${name}: ${iso} (${status})`;
}

/**
 * Decode a JWT (header + payload). Never verifies the signature and never
 * contacts the network. Strips all whitespace (wrapped terminal pastes), accepts
 * an optional Bearer prefix, and tolerates Base64 padding / standard `+/` alphabet.
 */
export function decodeJwt(input: string, nowMs: number = Date.now()): string {
  // Remove every whitespace char first so line-wrapped copies still parse.
  let token = input.replace(/\s+/g, '');
  if (/^Bearer/i.test(token)) {
    token = token.slice(6); // length of "Bearer"
  }
  if (!token) {
    throw new Error('Paste a JWT to decode.');
  }

  const parts = token.split('.');
  if (parts.length !== 2 && parts.length !== 3) {
    throw new Error('JWT must have 2 or 3 dot-separated parts.');
  }

  const header = parseJsonPart(parts[0], 'header');
  const payload = parseJsonPart(parts[1], 'payload');
  // parts[2] (signature) may be present or empty — ignored on purpose.

  const lines: string[] = [
    'Header',
    JSON.stringify(header, null, 2),
    '',
    'Payload',
    JSON.stringify(payload, null, 2),
  ];

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    const claims = ['exp', 'iat', 'nbf']
      .map((name) => claimLine(name, record[name], nowMs))
      .filter((line): line is string => !!line);
    if (claims.length) {
      lines.push('', 'Claims', ...claims);
    }
  }

  return lines.join('\n');
}
