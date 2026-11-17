export function currentUnixTimestamp(): string {
  return String(Math.floor(Date.now() / 1000));
}

export function unixTimestampToIso(text: string): string {
  const trimmed = text.trim();
  const value = Number(trimmed);
  if (!trimmed || Number.isNaN(value)) {
    throw new Error('Not a valid Unix timestamp.');
  }
  const ms = trimmed.length > 10 ? value : value * 1000;
  return new Date(ms).toISOString();
}
