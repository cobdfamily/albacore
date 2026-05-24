// @cobd/core -- the shell-agnostic screen-reader
// library. Runs in any TS/JS environment (browser
// renderer via @cobd/hook, Node via @cobd/net, or
// anywhere else with a compatible Transport).
//
// Core does NOT know how the underlying *fin AX
// server is reached -- that wiring lives in the
// host. The host passes in a Transport (see below)
// and core drives the screen-reader logic on top
// of it.

export interface Transport {
    // Send a JSON-RPC request and resolve with its
    // result. The host is responsible for matching
    // ids and rejecting on protocol errors.
    request<T = unknown>(method: string, params?: unknown): Promise<T>;

    // Subscribe to a server-emitted notification by
    // name. Returns an unsubscribe handle. Multiple
    // listeners per notification name are allowed.
    on(name: string, handler: (params: unknown) => void): () => void;
}

// Opaque handle for a node in the accessibility
// tree. Treat as a string; the value is only
// meaningful to the server that minted it.
export type NodeHandle = string;

// Skeleton Reader. Phase E expands this with
// navigation state, output (speech) wiring, and
// the input-to-action mapping. For now it's just
// a thin pass-through over Transport so consumers
// can verify the wiring end-to-end.
export class Reader {
    constructor(private transport: Transport) {}

    static async start(transport: Transport): Promise<Reader> {
        return new Reader(transport);
    }

    async getRootHandle(): Promise<NodeHandle> {
        const result = await this.transport.request<{ handle: NodeHandle }>("tree.getRoot");
        return result.handle;
    }

    async getFocusedHandle(): Promise<NodeHandle | null> {
        const result = await this.transport.request<{ handle: NodeHandle | null }>("tree.getFocused");
        return result.handle;
    }
}
