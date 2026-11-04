import * as assert from 'assert';
import * as vscode from 'vscode';
import { REFRESH_INTERVAL_MS, RefreshScheduler } from './refreshScheduler';

interface FakeInterval {
  id: number;
  callback: () => void;
  ms: number;
}

function installFakeTimers() {
  const intervals = new Map<number, FakeInterval>();
  let nextId = 1;
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;

  (global as any).setInterval = (callback: () => void, ms: number) => {
    const id = nextId++;
    intervals.set(id, { id, callback, ms });
    return id as unknown as ReturnType<typeof setInterval>;
  };
  (global as any).clearInterval = (id: unknown) => {
    intervals.delete(id as number);
  };

  return {
    activeCount: () => intervals.size,
    intervalMs: () => [...intervals.values()][0]?.ms,
    fireAll: () => {
      for (const interval of [...intervals.values()]) {
        interval.callback();
      }
    },
    restore: () => {
      global.setInterval = originalSetInterval;
      global.clearInterval = originalClearInterval;
    },
  };
}

function createFakeView(initialVisible: boolean): { view: vscode.WebviewView; setVisible: (v: boolean) => void } {
  const emitter = new vscode.EventEmitter<void>();
  let visible = initialVisible;
  const view = {
    get visible() {
      return visible;
    },
    onDidChangeVisibility: emitter.event,
  } as unknown as vscode.WebviewView;

  return {
    view,
    setVisible: (v: boolean) => {
      visible = v;
      emitter.fire();
    },
  };
}

suite('RefreshScheduler', () => {
  let timers: ReturnType<typeof installFakeTimers>;

  setup(() => {
    timers = installFakeTimers();
  });

  teardown(() => {
    timers.restore();
  });

  test('RefreshScheduler_startsTimer_whenVisibleAtConstruction', async () => {
    const { view } = createFakeView(true);
    let calls = 0;
    new RefreshScheduler(view, async () => {
      calls++;
    });

    await Promise.resolve();

    assert.strictEqual(calls, 1);
    assert.strictEqual(timers.activeCount(), 1);
    assert.strictEqual(timers.intervalMs(), REFRESH_INTERVAL_MS);
  });

  test('RefreshScheduler_doesNotStartTimer_whenHiddenAtConstruction', async () => {
    const { view } = createFakeView(false);
    let calls = 0;
    new RefreshScheduler(view, async () => {
      calls++;
    });

    await Promise.resolve();

    assert.strictEqual(calls, 0);
    assert.strictEqual(timers.activeCount(), 0);
  });

  test('RefreshScheduler_callsOnRefresh_everyIntervalMs_whileVisible', async () => {
    const { view } = createFakeView(true);
    let calls = 0;
    new RefreshScheduler(view, async () => {
      calls++;
    });
    await Promise.resolve();

    timers.fireAll();
    timers.fireAll();

    assert.strictEqual(calls, 3);
  });

  test('RefreshScheduler_pausesTimer_whenVisibilityBecomesFalse', async () => {
    const { view, setVisible } = createFakeView(true);
    new RefreshScheduler(view, async () => {});
    await Promise.resolve();

    setVisible(false);

    assert.strictEqual(timers.activeCount(), 0);
  });

  test('RefreshScheduler_callsOnRefreshImmediately_whenVisibilityRegained', async () => {
    const { view, setVisible } = createFakeView(false);
    let calls = 0;
    new RefreshScheduler(view, async () => {
      calls++;
    });
    await Promise.resolve();
    assert.strictEqual(calls, 0);

    setVisible(true);
    await Promise.resolve();

    assert.strictEqual(calls, 1);
    assert.strictEqual(timers.activeCount(), 1);
  });

  test('RefreshScheduler_doesNotCallOnRefresh_whileHidden_evenAfterIntervalElapses', async () => {
    const { view, setVisible } = createFakeView(true);
    let calls = 0;
    new RefreshScheduler(view, async () => {
      calls++;
    });
    await Promise.resolve();
    setVisible(false);

    timers.fireAll();

    assert.strictEqual(calls, 1);
  });

  test('RefreshScheduler_triggerManualRefresh_callsOnRefresh_withoutAffectingTimerSchedule', async () => {
    const { view } = createFakeView(true);
    let calls = 0;
    const scheduler = new RefreshScheduler(view, async () => {
      calls++;
    });
    await Promise.resolve();
    const activeBefore = timers.activeCount();

    await scheduler.triggerManualRefresh();

    assert.strictEqual(calls, 2);
    assert.strictEqual(timers.activeCount(), activeBefore);
  });

  test('RefreshScheduler_dispose_clearsTimerAndUnsubscribes', async () => {
    const { view, setVisible } = createFakeView(true);
    let calls = 0;
    const scheduler = new RefreshScheduler(view, async () => {
      calls++;
    });
    await Promise.resolve();

    scheduler.dispose();
    setVisible(false);
    timers.fireAll();

    assert.strictEqual(timers.activeCount(), 0);
    assert.strictEqual(calls, 1);
  });
});
