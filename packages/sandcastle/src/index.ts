import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

const PROTOCOL_VERSION = '0.1';
const WELCOME_TIMEOUT_MS = 5_000;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

export type WelcomeMetadata = {
  protocol: string;
  server: string;
  version: string;
  capabilities: Record<string, unknown>;
};

export type JsonRpcError = {
  code: number;
  message: string;
  data?: unknown;
};

export type NodeHandleResult = { handle: string | null };
export type GetAttributeResult = { value: unknown };
export type GetAttributesResult = { attributes: Record<string, unknown> };
export type GetChildrenResult = { children: string[]; total: number };
export type GetAncestorsResult = { ancestors: string[] };
export type GetActionsResult = { actions: string[] };
export type OkResult = { ok: true };
export type SubscribeResult = { subscriptionId: string };

export type NodeSnapshot = {
  handle: string;
  stableId?: string | null;
  attributes: Record<string, unknown>;
  children?: NodeSnapshot[];
};

export type SnapshotResult = { node: NodeSnapshot };
export type SiblingDirection = 'next' | 'previous';

export type RawAxEvent = {
  subscriptionId?: string;
  name: string;
  handle?: string;
  [key: string]: unknown;
};

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: JsonObject;
};

type JsonRpcResponse = {
  jsonrpc?: '2.0';
  id: number;
  result?: unknown;
  error?: JsonRpcError;
};

type JsonRpcNotification = {
  jsonrpc?: '2.0';
  method: string;
  params?: unknown;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

type Listener = (event: RawAxEvent) => void;

type SandcastleProcess = {
  stdin: Writable;
  stdout: Readable;
  stderr?: Readable | null;
  kill(signal?: NodeJS.Signals | number): boolean;
  once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  once(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  off(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  off(event: 'error', listener: (error: Error) => void): unknown;
};

type SpawnServer = (command: string, args: string[], options: SpawnOptionsWithoutStdio) => SandcastleProcess;

export type SandcastleStartOptions = {
  binaryPath?: string;
  spawn?: SpawnServer;
  welcomeTimeoutMs?: number;
};

export type RawTreeApi = {
  getRoot(): Promise<NodeHandleResult>;
  getFocused(): Promise<NodeHandleResult>;
};

export type RawNodeApi = {
  getAttribute(handle: string, name: string): Promise<GetAttributeResult>;
  getAttributes(handle: string, names: string[]): Promise<GetAttributesResult>;
  getChildren(handle: string, offset?: number, limit?: number): Promise<GetChildrenResult>;
  getParent(handle: string): Promise<NodeHandleResult>;
  getAncestors(handle: string): Promise<GetAncestorsResult>;
  getSibling(handle: string, direction: SiblingDirection): Promise<NodeHandleResult>;
  getActions(handle: string): Promise<GetActionsResult>;
  invokeAction(handle: string, action: string): Promise<OkResult>;
  setAttribute(handle: string, name: string, value: unknown): Promise<OkResult>;
};

export class Sandcastle {
  readonly welcome: WelcomeMetadata;
  readonly tree: RawTreeApi;
  readonly node: RawNodeApi;

  #child: SandcastleProcess;
  #nextId = 1;
  #pending = new Map<number, PendingRequest>();
  #buffer = '';
  #stopped = false;
  #listeners = new Map<string, Set<Listener>>();

  private constructor(child: SandcastleProcess, welcome: WelcomeMetadata) {
    this.#child = child;
    this.welcome = welcome;

    this.tree = {
      getRoot: () => this.#request<NodeHandleResult>('tree.getRoot'),
      getFocused: () => this.#request<NodeHandleResult>('tree.getFocused')
    };

    this.node = {
      getAttribute: (handle, name) => this.#request<GetAttributeResult>('node.getAttribute', { handle, name }),
      getAttributes: (handle, names) => this.#request<GetAttributesResult>('node.getAttributes', { handle, names }),
      getChildren: (handle, offset, limit) => {
        const params: JsonObject = { handle };
        if (offset !== undefined) params.offset = offset;
        if (limit !== undefined) params.limit = limit;
        return this.#request<GetChildrenResult>('node.getChildren', params);
      },
      getParent: (handle) => this.#request<NodeHandleResult>('node.getParent', { handle }),
      getAncestors: (handle) => this.#request<GetAncestorsResult>('node.getAncestors', { handle }),
      getSibling: (handle, direction) => this.#request<NodeHandleResult>('node.getSibling', { handle, direction }),
      getActions: (handle) => this.#request<GetActionsResult>('node.getActions', { handle }),
      invokeAction: (handle, action) => this.#request<OkResult>('node.invokeAction', { handle, action }),
      setAttribute: (handle, name, value) => this.#request<OkResult>('node.setAttribute', { handle, name, value: value as Json })
    };
  }

  static async start(options: SandcastleStartOptions = {}): Promise<Sandcastle> {
    const binaryPath = options.binaryPath ?? resolveBluefinServerPath();
    const spawnServer = options.spawn ?? defaultSpawnServer;
    const child = spawnServer(binaryPath, [], { stdio: 'pipe' });
    const welcome = await waitForWelcome(child, options.welcomeTimeoutMs ?? WELCOME_TIMEOUT_MS);
    const sandcastle = new Sandcastle(child, welcome);
    sandcastle.#attachRuntimeHandlers();
    return sandcastle;
  }

  stop(): Promise<void> {
    if (this.#stopped) return Promise.resolve();
    this.#stopped = true;
    this.#rejectPending(new Error('Sandcastle stopped before the request completed.'));
    this.#child.stdin.end();
    this.#child.kill();
    return Promise.resolve();
  }

  protected addRawListener(name: string, listener: Listener): () => void {
    const listeners = this.#listeners.get(name) ?? new Set<Listener>();
    listeners.add(listener);
    this.#listeners.set(name, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.#listeners.delete(name);
    };
  }

  #attachRuntimeHandlers(): void {
    this.#child.stdout.on('data', (chunk: Buffer | string) => this.#acceptData(chunk));
    this.#child.on('exit', (code, signal) => {
      if (this.#stopped) return;
      this.#stopped = true;
      this.#rejectPending(new Error(`bluefin-server exited before completing pending requests (code ${code ?? 'null'}, signal ${signal ?? 'null'}).`));
    });
    this.#child.on('error', (error) => {
      this.#rejectPending(error);
    });
  }

  #request<T>(method: string, params?: JsonObject): Promise<T> {
    if (this.#stopped) {
      return Promise.reject(new Error('Sandcastle has stopped.'));
    }

    const id = this.#nextId++;
    const request: JsonRpcRequest = { jsonrpc: '2.0', id, method };
    if (params !== undefined) request.params = params;

    return new Promise<T>((resolveRequest, rejectRequest) => {
      this.#pending.set(id, {
        resolve: (value) => resolveRequest(value as T),
        reject: rejectRequest
      });

      this.#child.stdin.write(`${JSON.stringify(request)}\n`, (error?: Error | null) => {
        if (!error) return;
        this.#pending.delete(id);
        rejectRequest(error);
      });
    });
  }

  #acceptData(chunk: Buffer | string): void {
    this.#buffer += chunk.toString();

    for (;;) {
      const newlineIndex = this.#buffer.indexOf('\n');
      if (newlineIndex === -1) return;
      const line = this.#buffer.slice(0, newlineIndex).trim();
      this.#buffer = this.#buffer.slice(newlineIndex + 1);
      if (line.length === 0) continue;
      this.#acceptLine(line);
    }
  }

  #acceptLine(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch (error) {
      this.#rejectPending(error);
      return;
    }

    if (isResponse(message)) {
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      if (message.error) pending.reject(new SandcastleRpcError(message.error));
      else pending.resolve(message.result);
      return;
    }

    if (isNotification(message)) {
      this.#acceptNotification(message);
    }
  }

  #acceptNotification(message: JsonRpcNotification): void {
    if (message.method !== 'axEvent' || !isRawAxEvent(message.params)) return;
    const listeners = this.#listeners.get(message.params.name);
    if (!listeners) return;
    for (const listener of listeners) listener(message.params);
  }

  #rejectPending(error: unknown): void {
    for (const pending of this.#pending.values()) {
      pending.reject(error);
    }
    this.#pending.clear();
  }
}

export class SandcastleRpcError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(error: JsonRpcError) {
    super(error.message);
    this.name = 'SandcastleRpcError';
    this.code = error.code;
    this.data = error.data;
  }
}

export function resolveBluefinServerPath(): string {
  if (process.env.BLUEFIN_SERVER_PATH) {
    return process.env.BLUEFIN_SERVER_PATH;
  }

  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const packageDir = moduleDir.endsWith('/src') || moduleDir.endsWith('/dist') ? dirname(moduleDir) : moduleDir;
  const devPath = resolve(packageDir, '../../../bluefin-swift/.build/debug/bluefin-server');
  if (existsSync(devPath)) return devPath;

  throw new Error('Could not resolve bluefin-server. Build Tuna/bluefin-swift or set BLUEFIN_SERVER_PATH to the bluefin-server binary.');
}

function defaultSpawnServer(command: string, args: string[], options: SpawnOptionsWithoutStdio): ChildProcessWithoutNullStreams {
  return nodeSpawn(command, args, options);
}

function waitForWelcome(child: SandcastleProcess, timeoutMs: number): Promise<WelcomeMetadata> {
  let buffer = '';
  let settled = false;

  return new Promise<WelcomeMetadata>((resolveWelcome, rejectWelcome) => {
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectWelcome(new Error(`Timed out waiting ${timeoutMs}ms for bluefin-server welcome notification.`));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.off?.('exit', onExit);
      child.off?.('error', onError);
    };

    const settleReject = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectWelcome(error);
    };

    const settleResolve = (welcome: WelcomeMetadata) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolveWelcome(welcome);
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      settleReject(new Error(`bluefin-server exited before welcome (code ${code ?? 'null'}, signal ${signal ?? 'null'}).`));
    };

    const onError = (error: Error) => settleReject(error);

    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString();
      for (;;) {
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) return;
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line.length === 0) continue;

        let message: unknown;
        try {
          message = JSON.parse(line);
        } catch (error) {
          settleReject(error instanceof Error ? error : new Error(String(error)));
          return;
        }

        if (!isNotification(message) || message.method !== 'welcome') continue;
        if (!isWelcomeMetadata(message.params)) {
          settleReject(new Error('bluefin-server sent an invalid welcome notification.'));
          return;
        }
        if (message.params.protocol !== PROTOCOL_VERSION) {
          settleReject(new Error(`Unsupported bluefin protocol ${message.params.protocol}; expected ${PROTOCOL_VERSION}.`));
          return;
        }
        settleResolve(message.params);
        return;
      }
    };

    child.stdout.on('data', onData);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

function isResponse(value: unknown): value is JsonRpcResponse {
  if (!isRecord(value)) return false;
  return typeof value.id === 'number' && ('result' in value || 'error' in value);
}

function isNotification(value: unknown): value is JsonRpcNotification {
  if (!isRecord(value)) return false;
  return typeof value.method === 'string' && !('id' in value);
}

function isRawAxEvent(value: unknown): value is RawAxEvent {
  return isRecord(value) && typeof value.name === 'string';
}

function isWelcomeMetadata(value: unknown): value is WelcomeMetadata {
  return (
    isRecord(value) &&
    typeof value.protocol === 'string' &&
    typeof value.server === 'string' &&
    typeof value.version === 'string' &&
    isRecord(value.capabilities)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
