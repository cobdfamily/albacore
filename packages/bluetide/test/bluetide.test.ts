// Bluetide tests. The spawn path is hard to cover
// against a real binary; tests pass a custom spawn
// callback that returns a fake ChildProcess so we
// can verify the welcome handshake + stop wiring
// without launching anything.

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { test } from "node:test";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { Bluetide } from "../src/index.ts";

const welcome = {
    jsonrpc: "2.0",
    method: "welcome",
    params: {
        protocol: "0.1",
        server: "bluefin-swift",
        version: "0.1.0",
        capabilities: {
            platforms: ["macOS"],
            writableAttributes: true,
            transport: "stdio"
        }
    }
};

class FakeChild extends EventEmitter {
    readonly stdout = new PassThrough();
    readonly stderr = new PassThrough();
    readonly stdin: Writable;
    killed = false;

    constructor() {
        super();
        this.stdin = new Writable({
            write: (_chunk, _encoding, callback) => callback()
        });
    }

    kill(): boolean {
        this.killed = true;
        this.emit("exit", null, "SIGTERM");
        return true;
    }

    send(message: unknown): void {
        this.stdout.write(`${JSON.stringify(message)}\n`);
    }
}

test("Bluetide.start spawns + waits for welcome + returns a Sandcastle", async () => {
    const child = new FakeChild();
    const started = Bluetide.start({
        binaryPath: "/mock/bluefin-server",
        spawn: () => child as unknown as ChildProcessWithoutNullStreams,
        welcomeTimeoutMs: 50
    });
    child.send(welcome);
    const sc = await started;
    assert.equal(sc.welcome.server, "bluefin-swift");
    await sc.stop();
    assert.equal(child.killed, true);
});

test("Bluetide.start propagates welcome timeout from Sandcastle.connect", async () => {
    const child = new FakeChild();
    await assert.rejects(
        Bluetide.start({
            binaryPath: "/mock/bluefin-server",
            spawn: () => child as unknown as ChildProcessWithoutNullStreams,
            welcomeTimeoutMs: 10
        }),
        /Timed out waiting 10ms/
    );
});
