import * as assert from 'assert';
import { EventEmitter } from 'events';
import {
  CURSOR_CLI_ASK_PRINT_ARGS,
  CursorCliClient,
  type SpawnFn,
} from './cursorCliClient';
import { AiUnavailableError } from '../../services/ai/aiAssistant';

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = {
    end: (data?: string, _encoding?: string) => {
      this.stdinData = data ?? '';
    },
  };
  stdinData = '';
  killed = false;

  kill(): void {
    this.killed = true;
    this.emit('close', 1);
  }
}

function scriptedSpawn(script: (command: string, args: readonly string[], child: FakeChild) => void): {
  spawn: SpawnFn;
  calls: Array<{ command: string; args: readonly string[] }>;
} {
  const calls: Array<{ command: string; args: readonly string[] }> = [];
  const spawn: SpawnFn = (command, args) => {
    calls.push({ command, args });
    const child = new FakeChild();
    queueMicrotask(() => script(command, args, child));
    return child as unknown as ReturnType<SpawnFn>;
  };
  return { spawn, calls };
}

suite('CursorCliClient', () => {
  test('pathMiss_reportsUnavailable_andSendRequestThrowsCliMissing', async () => {
    const client = new CursorCliClient({
      resolveBinary: async () => null,
      spawn: () => { throw new Error('should not spawn'); },
    });
    const status = await client.getStatus();
    assert.deepStrictEqual(status, { available: false, authenticated: false, binary: null });
    await assert.rejects(
      () => client.sendRequest('auto', [{ role: 'user', content: 'hi' }], () => undefined),
      (error: unknown) => error instanceof AiUnavailableError && error.reason === 'cliMissing',
    );
  });

  test('presentButUnauthenticated_throwsCliUnauthenticated', async () => {
    const { spawn } = scriptedSpawn((_command, args, child) => {
      if (args[0] === 'status') {
        child.stdout.emit('data', 'Not authenticated\n');
        child.emit('close', 1);
        return;
      }
      child.emit('close', 0);
    });
    const client = new CursorCliClient({
      resolveBinary: async () => 'agent',
      spawn,
      env: {},
    });
    const status = await client.getStatus();
    assert.strictEqual(status.available, true);
    assert.strictEqual(status.authenticated, false);
    await assert.rejects(
      () => client.sendRequest('auto', [{ role: 'user', content: 'hi' }], () => undefined),
      (error: unknown) => error instanceof AiUnavailableError && error.reason === 'cliUnauthenticated',
    );
  });

  test('askPrintArgv_isPinned_andOmitsModelWhenEmpty_orAuto', async () => {
    const { spawn, calls } = scriptedSpawn((_command, args, child) => {
      if (args[0] === 'status') {
        child.stdout.emit('data', '✓ Logged in as someone\n');
        child.emit('close', 0);
        return;
      }
      child.stdout.emit('data', 'answer');
      child.emit('close', 0);
    });
    const client = new CursorCliClient({
      resolveBinary: async () => 'agent',
      spawn,
      env: { CURSOR_API_KEY: 'test-key' },
    });

    await client.sendRequest('auto', [{ role: 'user', content: 'prompt text' }], () => undefined);
    const askCall = calls.find((call) => call.args.includes('-p'));
    assert.ok(askCall);
    assert.deepStrictEqual(askCall!.args.slice(0, CURSOR_CLI_ASK_PRINT_ARGS.length), [...CURSOR_CLI_ASK_PRINT_ARGS]);
    assert.ok(!askCall!.args.includes('--model'));
    assert.ok(!askCall!.args.some((arg) => /write|shell|yolo|force/i.test(arg)));
  });

  test('nonEmptyModel_addsModelFlag_andPromptGoesOnStdin', async () => {
    let stdin = '';
    const { spawn, calls } = scriptedSpawn((_command, args, child) => {
      if (args.includes('-p')) {
        stdin = child.stdinData;
        queueMicrotask(() => {
          child.stdout.emit('data', 'ok');
          child.emit('close', 0);
        });
        return;
      }
      child.emit('close', 0);
    });
    const client = new CursorCliClient({
      resolveBinary: async () => 'cursor-agent',
      spawn,
      env: { CURSOR_API_KEY: 'k' },
    });
    // Force stdin capture after end() — FakeChild sets stdinData synchronously in end().
    const longPrompt = 'x'.repeat(200);
    const result = await client.sendRequest('sonnet-4', [{ role: 'user', content: longPrompt }], () => undefined);
    assert.strictEqual(result, 'ok');
    const askCall = calls.find((call) => call.args.includes('-p'));
    assert.deepStrictEqual(askCall?.args.slice(-2), ['--model', 'sonnet-4']);
    assert.strictEqual(stdin, longPrompt);
  });

  test('cancel_killsChildProcess', async () => {
    let childRef: FakeChild | undefined;
    const { spawn } = scriptedSpawn((_command, args, child) => {
      if (args.includes('-p')) {
        childRef = child;
        // Never close until kill.
        return;
      }
      child.stdout.emit('data', '✓ Logged in\n');
      child.emit('close', 0);
    });
    const client = new CursorCliClient({
      resolveBinary: async () => 'agent',
      spawn,
      env: { CURSOR_API_KEY: 'k' },
    });
    const listeners: Array<() => void> = [];
    const token = {
      isCancellationRequested: false,
      onCancellationRequested(listener: () => unknown) {
        listeners.push(listener);
        return { dispose() { /* noop */ } };
      },
    };
    const pending = client.sendRequest('auto', [{ role: 'user', content: 'hi' }], () => undefined, token);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(childRef);
    token.isCancellationRequested = true;
    for (const listener of listeners) listener();
    await assert.rejects(pending);
    assert.strictEqual(childRef!.killed, true);
  });

  test('cursorApiKey_countsAsAuthenticated_withoutStatusProbe', async () => {
    let statusCalled = false;
    const { spawn } = scriptedSpawn((_command, args, child) => {
      if (args[0] === 'status') statusCalled = true;
      child.emit('close', 0);
    });
    const client = new CursorCliClient({
      resolveBinary: async () => 'agent',
      spawn,
      env: { CURSOR_API_KEY: 'from-env' },
    });
    const status = await client.getStatus();
    assert.strictEqual(status.authenticated, true);
    assert.strictEqual(statusCalled, false);
  });
});
