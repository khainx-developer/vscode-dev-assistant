import { createHash } from 'crypto';

const ALGORITHMS = ['sha256', 'sha1', 'md5', 'sha512'] as const;
type HashAlgorithm = (typeof ALGORITHMS)[number];

const LABELS: Record<HashAlgorithm, string> = {
  sha256: 'SHA-256',
  sha1: 'SHA-1',
  md5: 'MD5',
  sha512: 'SHA-512',
};

/** Injectable digest for tests (e.g. simulate FIPS rejecting an algorithm). */
export type DigestFn = (algorithm: HashAlgorithm, input: string) => string;

const defaultDigest: DigestFn = (algorithm, input) =>
  createHash(algorithm).update(input, 'utf8').digest('hex');

function isHashAlgorithm(value: string): value is HashAlgorithm {
  return (ALGORITHMS as readonly string[]).includes(value);
}

function tryDigest(
  algorithm: HashAlgorithm,
  input: string,
  digest: DigestFn,
): { ok: true; hex: string } | { ok: false } {
  try {
    return { ok: true, hex: digest(algorithm, input) };
  } catch {
    return { ok: false };
  }
}

/**
 * Hash UTF-8 text with Node crypto. Digests the input exactly as given (including
 * a trailing newline). Empty input is valid. Returns lowercase hex.
 *
 * Single-algorithm failures (e.g. FIPS rejecting MD5) throw with a user-facing
 * message. `all` prints SHA-256, SHA-1, MD5 and SHA-512 one per line, labelled,
 * and marks unavailable algorithms inline.
 */
export function hashText(
  algorithm: string,
  input: string,
  digest: DigestFn = defaultDigest,
): string {
  if (algorithm === 'all') {
    return ALGORITHMS.map((algo) => {
      const result = tryDigest(algo, input, digest);
      return result.ok
        ? `${LABELS[algo]}: ${result.hex}`
        : `${LABELS[algo]}: unavailable in this environment`;
    }).join('\n');
  }

  if (!isHashAlgorithm(algorithm)) {
    throw new Error(`Unknown hash algorithm: ${algorithm}`);
  }

  const result = tryDigest(algorithm, input, digest);
  if (!result.ok) {
    throw new Error(`${LABELS[algorithm]} is unavailable in this environment.`);
  }
  return result.hex;
}
