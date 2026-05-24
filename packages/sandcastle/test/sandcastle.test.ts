import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { PassThrough, Writable } from 'node:stream';
import { Sandcastle, attributes } from '../src/index.ts';

const welcome = {
  jsonrpc: '2.0',
  method: 'welcome',
  params: {
    protocol: '0.1',
    server: 'bluefin-swift',
    version: '0.1.0',
    capabilities: {
      platforms: ['macOS'],
      writableAttributes: true,
      transport: 'stdio'
    }
  }
};

class MockProcess extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly writes: string[] = [];
  killed = false;

  readonly stdin = new Writable({
    write: (chunk, _encoding, callback) => {
      this.writes.push(chunk.toString());
      callback();
    }
  });

  kill(): boolean {
    this.killed = true;
    this.emit('exit', null, 'SIGTERM');
    return true;
  }

  send(message: unknown): void {
    this.stdout.write(`${JSON.stringify(message)}\n`);
  }
}

test('start() resolves after welcome arrives', async () => {
  const proc = new MockProcess();
  const started = Sandcastle.start({
    binaryPath: '/mock/bluefin-server',
    spawn: () => proc,
    welcomeTimeoutMs: 50
  });

  proc.send(welcome);
  const sc = await started;

  assert.deepEqual(sc.welcome, welcome.params);
  await sc.stop();
});

test("start() rejects if welcome doesn't arrive within the timeout", async () => {
  const proc = new MockProcess();

  await assert.rejects(
    Sandcastle.start({
      binaryPath: '/mock/bluefin-server',
      spawn: () => proc,
      welcomeTimeoutMs: 10
    }),
    /Timed out waiting 10ms/
  );
});

test('outgoing requests are LF-delimited JSON-RPC objects', async () => {
  const { proc, sc } = await startMockSandcastle();

  // Catch the rejection that stop() will produce on
  // the pending request -- we are testing the wire
  // shape, not the resolution, so the rejection is
  // expected. Without this catch the abandoned
  // promise becomes an unhandledRejection after the
  // test ends.
  const pending = sc.node.getAttributes('node:1', ['AXTitle', 'AXRole']);
  pending.catch(() => undefined);
  await nextTick();

  assert.equal(proc.writes.length, 1);
  assert.match(proc.writes[0], /\n$/);
  assert.deepEqual(JSON.parse(proc.writes[0]), {
    jsonrpc: '2.0',
    id: 1,
    method: 'node.getAttributes',
    params: {
      handle: 'node:1',
      names: ['AXTitle', 'AXRole']
    }
  });

  await sc.stop();
});

test('incoming responses are matched to requests by id', async () => {
  const { proc, sc } = await startMockSandcastle();

  const root = sc.tree.getRoot();
  const focused = sc.tree.getFocused();
  await nextTick();

  proc.send({ jsonrpc: '2.0', id: 2, result: { handle: 'node:focused' } });
  proc.send({ jsonrpc: '2.0', id: 1, result: { handle: 'node:root' } });

  assert.deepEqual(await focused, { handle: 'node:focused' });
  assert.deepEqual(await root, { handle: 'node:root' });

  await sc.stop();
});

test('notifications dispatch to registered listeners', async () => {
  const { proc, sc } = await startMockSandcastle();
  const events: unknown[] = [];

  const off = sc.on('AXFocusedUIElementChanged', (event) => events.push(event));
  proc.send({
    jsonrpc: '2.0',
    method: 'axEvent',
    params: {
      subscriptionId: 'sub:1',
      name: 'AXFocusedUIElementChanged',
      handle: 'node:focused'
    }
  });

  assert.deepEqual(events, [
    {
      subscriptionId: 'sub:1',
      name: 'AXFocusedUIElementChanged',
      handle: 'node:focused'
    }
  ]);

  off();
  await sc.stop();
});

test('onAny taps every notification regardless of name', async () => {
  const { proc, sc } = await startMockSandcastle();
  const tapped: unknown[] = [];

  // Need at least one named subscription to make the
  // server forward the event in the first place;
  // onAny does NOT auto-subscribe, it only observes.
  const off = sc.on('AXFocusedUIElementChanged', () => undefined);
  const offAny = sc.onAny((event) => tapped.push(event));

  proc.send({
    jsonrpc: '2.0',
    method: 'axEvent',
    params: {
      name: 'AXFocusedUIElementChanged',
      handle: 'node:a'
    }
  });
  proc.send({
    jsonrpc: '2.0',
    method: 'axEvent',
    params: {
      name: 'AXValueChanged',
      handle: 'node:b'
    }
  });

  assert.equal(tapped.length, 2);
  assert.equal((tapped[0] as { name: string }).name, 'AXFocusedUIElementChanged');
  assert.equal((tapped[1] as { name: string }).name, 'AXValueChanged');

  offAny();
  off();
  await sc.stop();
});

test('normalized getAttributes translates names and role values', async () => {
  attributes.roleMap.AXButton = 'button';
  const { proc, sc } = await startMockSandcastle();

  const result = sc.normalized.node.getAttributes('node:1', ['name', 'role']);
  await nextTick();

  assert.deepEqual(JSON.parse(proc.writes[0]), {
    jsonrpc: '2.0',
    id: 1,
    method: 'node.getAttributes',
    params: {
      handle: 'node:1',
      names: ['AXTitle', 'AXDescription', 'AXRole']
    }
  });

  proc.send({
    jsonrpc: '2.0',
    id: 1,
    result: {
      attributes: {
        AXTitle: null,
        AXDescription: 'Compose',
        AXRole: 'AXButton'
      }
    }
  });

  assert.deepEqual(await result, {
    attributes: {
      name: 'Compose',
      role: 'button'
    }
  });

  await sc.stop();
});

test('stop() kills the child and rejects in-flight promises', async () => {
  const { proc, sc } = await startMockSandcastle();
  const pending = sc.tree.getRoot();
  await nextTick();

  await sc.stop();

  assert.equal(proc.killed, true);
  await assert.rejects(pending, /stopped before the request completed/);
});

async function startMockSandcastle(): Promise<{ proc: MockProcess; sc: Sandcastle }> {
  const proc = new MockProcess();
  const started = Sandcastle.start({
    binaryPath: '/mock/bluefin-server',
    spawn: () => proc,
    welcomeTimeoutMs: 50
  });
  proc.send(welcome);
  return { proc, sc: await started };
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}
