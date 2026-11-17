import * as assert from 'assert';
import { decodeJwt } from './jwt';

function b64url(json: unknown): string {
  return Buffer.from(JSON.stringify(json), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function token(header: unknown, payload: unknown, signature = 'sig'): string {
  return `${b64url(header)}.${b64url(payload)}.${signature}`;
}

const HEADER = { alg: 'none', typ: 'JWT' };
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0); // 2026-01-15T12:00:00.000Z

suite('decodeJwt', () => {
  test('validToken_prettyPrintsHeaderAndPayload', () => {
    const jwt = token(HEADER, { sub: 'user-1', name: 'Ada' });
    const out = decodeJwt(jwt, NOW);
    assert.ok(out.includes('Header'));
    assert.ok(out.includes('"alg": "none"'));
    assert.ok(out.includes('Payload'));
    assert.ok(out.includes('"sub": "user-1"'));
    assert.ok(out.includes('"name": "Ada"'));
  });

  test('paddingStripped_stillDecodes', () => {
    // Standard base64 of {"a":1} ends with padding; JWT form strips it.
    const jwt = `${b64url({ a: 1 })}.${b64url({ b: 2 })}.x`;
    const out = decodeJwt(jwt, NOW);
    assert.ok(out.includes('"a": 1'));
    assert.ok(out.includes('"b": 2'));
  });

  test('bearerPrefix_isAccepted', () => {
    const jwt = token(HEADER, { sub: 'x' });
    const out = decodeJwt(`  Bearer ${jwt}  `, NOW);
    assert.ok(out.includes('"sub": "x"'));
  });

  test('twoPartToken_decodesWithoutSignature', () => {
    const jwt = `${b64url(HEADER)}.${b64url({ ok: true })}`;
    const out = decodeJwt(jwt, NOW);
    assert.ok(out.includes('"ok": true'));
  });

  test('emptySignature_isAccepted', () => {
    const jwt = `${b64url(HEADER)}.${b64url({ ok: true })}.`;
    const out = decodeJwt(jwt, NOW);
    assert.ok(out.includes('"ok": true'));
  });

  test('invalidBase64url_throws', () => {
    assert.throws(() => decodeJwt('!!!!.!!!!.sig', NOW), /Base64URL/);
  });

  test('nonJsonPayload_throws', () => {
    const badPayload = Buffer.from('not-json', 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    assert.throws(() => decodeJwt(`${b64url(HEADER)}.${badPayload}.sig`, NOW), /JSON/);
  });

  test('wrongPartCount_throws', () => {
    assert.throws(() => decodeJwt('onlyone', NOW), /2 or 3/);
    assert.throws(() => decodeJwt('a.b.c.d', NOW), /2 or 3/);
  });

  test('expPast_reportsExpired', () => {
    const exp = Math.floor(Date.UTC(2020, 0, 1) / 1000);
    const out = decodeJwt(token(HEADER, { exp }), NOW);
    assert.ok(out.includes('Claims'));
    assert.ok(out.includes('2020-01-01T00:00:00.000Z'));
    assert.ok(/expired .+ ago/.test(out));
  });

  test('expFuture_reportsValidFor', () => {
    const exp = Math.floor(Date.UTC(2030, 0, 1) / 1000);
    const out = decodeJwt(token(HEADER, { exp }), NOW);
    assert.ok(out.includes('2030-01-01T00:00:00.000Z'));
    assert.ok(/valid for /.test(out));
  });

  test('missingExp_omitsClaimsSection', () => {
    const out = decodeJwt(token(HEADER, { sub: 'only' }), NOW);
    assert.ok(!out.includes('Claims'));
  });
});
