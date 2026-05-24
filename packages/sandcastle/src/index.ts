import type { Readable, Writable } from 'node:stream';
import { attributes } from './attributes.js';

export { attributes } from './attributes.js';

// Sandcastle deliberately holds NO runtime Node
// imports. Stream + child-process glue lives in
// @cobd/bluetide (Node-only) so this module can be
// bundled into a browser renderer that talks to
// the *fin server via an IPC bridge instead of a
// direct spawn.

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
export type GetAttributeNamesResult = { names: string[] };
export type GetChildrenResult = { children: string[]; total: number };
export type GetAncestorsResult = { ancestors: string[] };
export type GetActionsResult = { actions: string[] };
export type OkResult = { ok: true };
export type SubscribeResult = { subscriptionId: string };

export type AccessibilityEnabledResult = { enabled: boolean };
export type KeychainItemResult = { value: string | null };
export type BatteryStatusResult = {
  percentage: number | null;
  isCharging: boolean;
  isPresent: boolean;
};
export type AppleScriptResult = {
  result: string;
  isError: boolean;
  errorMessage?: string;
};

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

type SubscriptionState = {
  count: number;
  subscriptionId?: string;
  ready: Promise<void>;
};

// What bluetide (or any other Node host) passes
// into Sandcastle.connect. Sandcastle reads
// JSON-RPC lines from `input`, writes them to
// `output`, and uses `onStop` to tear down the
// underlying transport (typically: end stdin and
// kill the child). `exit` is an optional Promise
// that, when it resolves, means the underlying
// transport has gone away -- Sandcastle uses it to
// reject any in-flight requests with a descriptive
// error.
export type SandcastleConnectOptions = {
  input: Readable;
  output: Writable;
  welcomeTimeoutMs?: number;
  onStop?: () => void | Promise<void>;
  exit?: Promise<{ code: number | null; signal: string | null }>;
};

export type RawTreeApi = {
  getRoot(): Promise<NodeHandleResult>;
  getFocused(): Promise<NodeHandleResult>;
};

export type RawNodeApi = {
  getAttribute(handle: string, name: string): Promise<GetAttributeResult>;
  getAttributes(handle: string, names: string[]): Promise<GetAttributesResult>;
  getAttributeNames(handle: string): Promise<GetAttributeNamesResult>;
  getChildren(handle: string, offset?: number, limit?: number): Promise<GetChildrenResult>;
  getParent(handle: string): Promise<NodeHandleResult>;
  getAncestors(handle: string): Promise<GetAncestorsResult>;
  getSibling(handle: string, direction: SiblingDirection): Promise<NodeHandleResult>;
  getActions(handle: string): Promise<GetActionsResult>;
  invokeAction(handle: string, action: string): Promise<OkResult>;
  setAttribute(handle: string, name: string, value: unknown): Promise<OkResult>;
};

export type SystemApi = {
  isAccessibilityEnabled(): Promise<AccessibilityEnabledResult>;
  getBatteryStatus(): Promise<BatteryStatusResult>;
  runAppleScript(source: string): Promise<AppleScriptResult>;
};

export type SecurityApi = {
  getKeychainItem(service: string, account: string): Promise<KeychainItemResult>;
  setKeychainItem(service: string, account: string, value: string): Promise<OkResult>;
};

export type NormalizedTreeApi = Pick<RawTreeApi, 'getRoot' | 'getFocused'>;

export type NormalizedNodeApi = {
  getAttribute(handle: string, name: string): Promise<GetAttributeResult>;
  getAttributes(handle: string, names: string[]): Promise<GetAttributesResult>;
  getActions(handle: string): Promise<GetActionsResult>;
};

export type NormalizedApi = {
  tree: NormalizedTreeApi;
  node: NormalizedNodeApi;
};

export class Sandcastle {
  readonly welcome: WelcomeMetadata;
  readonly tree: RawTreeApi;
  readonly node: RawNodeApi;
  readonly system: SystemApi;
  readonly security: SecurityApi;
  readonly normalized: NormalizedApi;

  #input: Readable;
  #output: Writable;
  #onStop?: () => void | Promise<void>;
  #nextId = 1;
  #pending = new Map<number, PendingRequest>();
  #buffer = '';
  #stopped = false;
  #listeners = new Map<string, Set<Listener>>();
  #wildcardListeners = new Set<Listener>();
  #subscriptions = new Map<string, SubscriptionState>();

  private constructor(
    input: Readable,
    output: Writable,
    welcome: WelcomeMetadata,
    onStop?: () => void | Promise<void>
  ) {
    this.#input = input;
    this.#output = output;
    this.#onStop = onStop;
    this.welcome = welcome;

    this.tree = {
      getRoot: () => this.#request<NodeHandleResult>('tree.getRoot'),
      getFocused: () => this.#request<NodeHandleResult>('tree.getFocused')
    };

    this.node = {
      getAttribute: (handle, name) => this.#request<GetAttributeResult>('node.getAttribute', { handle, name }),
      getAttributes: (handle, names) => this.#request<GetAttributesResult>('node.getAttributes', { handle, names }),
      getAttributeNames: (handle) => this.#request<GetAttributeNamesResult>('node.getAttributeNames', { handle }),
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

    this.system = {
      isAccessibilityEnabled: () =>
        this.#request<AccessibilityEnabledResult>('system.isAccessibilityEnabled'),
      getBatteryStatus: () =>
        this.#request<BatteryStatusResult>('system.getBatteryStatus'),
      runAppleScript: (source) =>
        this.#request<AppleScriptResult>('system.runAppleScript', { source })
    };

    this.security = {
      getKeychainItem: (service, account) =>
        this.#request<KeychainItemResult>('security.getKeychainItem', { service, account }),
      setKeychainItem: (service, account, value) =>
        this.#request<OkResult>('security.setKeychainItem', { service, account, value })
    };

    this.normalized = {
      tree: {
        getRoot: this.tree.getRoot,
        getFocused: this.tree.getFocused
      },
      node: {
        getAttribute: async (handle, name) => {
          const result = await this.normalized.node.getAttributes(handle, [name]);
          return { value: result.attributes[name] ?? null };
        },
        getAttributes: async (handle, names) => {
          const rawNames = attributes.rawNamesFor(names);
          const result = await this.node.getAttributes(handle, rawNames);
          const normalized = attributes.normalize(result.attributes);
          return { attributes: pickAttributes(normalized, names) };
        },
        getActions: async (handle) => {
          const result = await this.node.getActions(handle);
          return { actions: attributes.normalizeActions(result.actions) };
        }
      }
    };
  }

  // Bring an already-running *fin server's stdio
  // online. Bluetide (or whatever wired up the
  // transport) hands us streams; we wait for the
  // welcome notification, then return a connected
  // Sandcastle.
  static async connect(options: SandcastleConnectOptions): Promise<Sandcastle> {
    const welcome = await waitForWelcome(
      options.input,
      options.exit,
      options.welcomeTimeoutMs ?? WELCOME_TIMEOUT_MS
    );
    const sandcastle = new Sandcastle(
      options.input,
      options.output,
      welcome,
      options.onStop
    );
    sandcastle.#attachRuntimeHandlers(options.exit);
    return sandcastle;
  }

  async stop(): Promise<void> {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#rejectPending(new Error('Sandcastle stopped before the request completed.'));
    // The host (bluetide / IPC bridge) decides what
    // "stop" means -- kill the child, close the
    // socket, etc. Sandcastle just stops reading.
    if (this.#onStop) await this.#onStop();
  }

  subscribe(events: string[]): Promise<SubscribeResult> {
    return this.#request<SubscribeResult>('subscribe', { events });
  }

  unsubscribe(subscriptionId: string): Promise<OkResult> {
    return this.#request<OkResult>('unsubscribe', { subscriptionId });
  }

  on(name: string, listener: Listener): () => void {
    const removeLocalListener = this.#addRawListener(name, listener);
    this.#retainSubscription(name);

    return () => {
      removeLocalListener();
      this.#releaseSubscription(name);
    };
  }

  // Tap every notification that arrives, regardless
  // of name. Does NOT auto-subscribe to anything --
  // wildcard listeners only see events that some
  // other caller has already asked the server to
  // forward via on()/subscribe(). Intended for
  // observability and debug logging.
  onAny(listener: Listener): () => void {
    this.#wildcardListeners.add(listener);
    return () => {
      this.#wildcardListeners.delete(listener);
    };
  }

  #addRawListener(name: string, listener: Listener): () => void {
    const listeners = this.#listeners.get(name) ?? new Set<Listener>();
    listeners.add(listener);
    this.#listeners.set(name, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.#listeners.delete(name);
    };
  }

  #retainSubscription(name: string): void {
    const existing = this.#subscriptions.get(name);
    if (existing) {
      existing.count += 1;
      return;
    }

    const state: SubscriptionState = {
      count: 1,
      ready: this.subscribe([name]).then((result) => {
        state.subscriptionId = result.subscriptionId;
      })
    };
    this.#subscriptions.set(name, state);
  }

  #releaseSubscription(name: string): void {
    const state = this.#subscriptions.get(name);
    if (!state) return;

    state.count -= 1;
    if (state.count > 0) return;

    this.#subscriptions.delete(name);
    state.ready
      .then(() => {
        if (state.subscriptionId && !this.#stopped) {
          return this.unsubscribe(state.subscriptionId);
        }
        return undefined;
      })
      .catch(() => undefined);
  }

  #attachRuntimeHandlers(exit?: Promise<{ code: number | null; signal: string | null }>): void {
    this.#input.on('data', (chunk: Buffer | string) => this.#acceptData(chunk));
    this.#input.on('error', (error: Error) => this.#rejectPending(error));
    this.#output.on('error', (error: Error) => this.#rejectPending(error));
    if (exit) {
      exit.then(({ code, signal }) => {
        if (this.#stopped) return;
        this.#stopped = true;
        this.#rejectPending(new Error(
          `bluefin-server exited before completing pending requests ` +
          `(code ${code ?? 'null'}, signal ${signal ?? 'null'}).`
        ));
      }).catch((error: unknown) => {
        this.#rejectPending(error);
      });
    }
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

      this.#output.write(`${JSON.stringify(request)}\n`, (error?: Error | null) => {
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
    if (listeners) {
      for (const listener of listeners) listener(message.params);
    }
    for (const wildcard of this.#wildcardListeners) {
      wildcard(message.params);
    }
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

function waitForWelcome(
  input: Readable,
  exit: Promise<{ code: number | null; signal: string | null }> | undefined,
  timeoutMs: number
): Promise<WelcomeMetadata> {
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
      input.off('data', onData);
      input.off('error', onError);
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

    input.on('data', onData);
    input.on('error', onError);
    exit?.then(({ code, signal }) =>
      settleReject(new Error(
        `bluefin-server exited before welcome ` +
        `(code ${code ?? 'null'}, signal ${signal ?? 'null'}).`
      ))
    ).catch((error: unknown) =>
      settleReject(error instanceof Error ? error : new Error(String(error)))
    );
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

function pickAttributes(source: Record<string, unknown>, names: readonly string[]): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const name of names) {
    picked[name] = source[name] ?? null;
  }
  return picked;
}
