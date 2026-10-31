export function base64Encode(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

export function base64Decode(text: string): string {
  return Buffer.from(text, 'base64').toString('utf8');
}
