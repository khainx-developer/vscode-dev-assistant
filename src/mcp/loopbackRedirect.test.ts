import * as assert from 'assert';
import * as http from 'http';
import { LoopbackRedirectServer } from './loopbackRedirect';

function get(url: string): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0 });
    });
    req.on('error', reject);
  });
}

function assertConnectionRefused(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { agent: false }, () => {
      req.destroy();
      reject(new Error('expected connection to fail, but it succeeded'));
    });
    req.on('error', () => resolve());
  });
}

suite('LoopbackRedirectServer', () => {
  test('start_successfulCallback_resolvesWithCode', async () => {
    const server = new LoopbackRedirectServer();
    const { redirectUri, result } = await server.start('state-123');

    await get(`${redirectUri}?code=abc123&state=state-123`);

    assert.deepStrictEqual(await result, { code: 'abc123' });
  });

  test('start_stateMismatch_rejectsInvalidEntry', async () => {
    const server = new LoopbackRedirectServer();
    const { redirectUri, result } = await server.start('expected-state');
    const rejection = assert.rejects(result, { category: 'invalid-entry', detail: 'OAuth state mismatch' });

    await get(`${redirectUri}?code=abc123&state=wrong-state`);

    await rejection;
  });

  test('start_errorQueryParam_rejectsAuthExpired', async () => {
    const server = new LoopbackRedirectServer();
    const { redirectUri, result } = await server.start('expected-state');
    const rejection = assert.rejects(result, { category: 'auth-expired', detail: 'User denied access' });

    await get(`${redirectUri}?error=access_denied&error_description=User+denied+access&state=expected-state`);

    await rejection;
  });

  test('start_errorCallback_stateMismatch_rejectsInvalidEntry', async () => {
    const server = new LoopbackRedirectServer();
    const { redirectUri, result } = await server.start('expected-state');
    const rejection = assert.rejects(result, { category: 'invalid-entry', detail: 'OAuth state mismatch' });

    await get(`${redirectUri}?error=access_denied&state=wrong-state`);

    await rejection;
  });

  test('start_callbackWithoutCode_rejectsInvalidEntry', async () => {
    const server = new LoopbackRedirectServer();
    const { redirectUri, result } = await server.start('expected-state');
    const rejection = assert.rejects(result, {
      category: 'invalid-entry',
      detail: 'OAuth callback did not include an authorization code',
    });

    await get(`${redirectUri}?state=expected-state`);

    await rejection;
  });

  test('start_timeout_rejectsNetwork', async () => {
    const server = new LoopbackRedirectServer();
    const { result } = await server.start('expected-state', 10);

    await assert.rejects(result, { category: 'network', detail: 'OAuth callback timed out' });
  });

  test('start_afterSettling_serverIsClosed', async () => {
    const successServer = new LoopbackRedirectServer();
    const success = await successServer.start('state-1');
    await get(`${success.redirectUri}?code=abc&state=state-1`);
    await success.result;
    await assertConnectionRefused(success.redirectUri);

    const mismatchServer = new LoopbackRedirectServer();
    const mismatch = await mismatchServer.start('state-2');
    await get(`${mismatch.redirectUri}?code=abc&state=wrong`);
    await assert.rejects(mismatch.result);
    await assertConnectionRefused(mismatch.redirectUri);

    const timeoutServer = new LoopbackRedirectServer();
    const timedOut = await timeoutServer.start('state-3', 10);
    await assert.rejects(timedOut.result);
    await assertConnectionRefused(timedOut.redirectUri);
  });
});
