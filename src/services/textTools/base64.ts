export function base64Encode(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

export function base64Decode(text: string): string {
  return Buffer.from(text, 'base64').toString('utf8');
}

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;

/** Decode a Base64URL string (JWT-style: `-`/`_`, optional padding). */
export function base64UrlDecode(text: string): string {
  if (!BASE64URL_PATTERN.test(text)) {
    throw new Error('Invalid Base64URL.');
  }
  let padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const rem = padded.length % 4;
  if (rem) {
    padded += '='.repeat(4 - rem);
  }
  return Buffer.from(padded, 'base64').toString('utf8');
}
