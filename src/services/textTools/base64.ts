export function base64Encode(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

export function base64Decode(text: string): string {
  return Buffer.from(text, 'base64').toString('utf8');
}

const BASE64_ALPHABET = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Decode a Base64URL (or plain Base64) string.
 * Accepts `-`/`_` or `+/`, with or without `=` padding — common when pasting JWTs.
 */
export function base64UrlDecode(text: string): string {
  let padded = text.replace(/-/g, '+').replace(/_/g, '/');
  if (!BASE64_ALPHABET.test(padded)) {
    throw new Error('Invalid Base64URL.');
  }
  const rem = padded.length % 4;
  if (rem) {
    padded += '='.repeat(4 - rem);
  }
  return Buffer.from(padded, 'base64').toString('utf8');
}
