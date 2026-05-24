// Sandbucket tests. The sandcastle layer already has
// its own tests against a mocked binary; here we
// stub Sandcastle entirely and assert that Element /
// App route their method calls to the right wire
// methods. No process spawning, no protocol parsing
// at this level.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Sandbucket, Element, App } from "../src/index.js";
import type { Sandcastle } from "@cobd/sandcastle";

type Recorded = { method: string; args: unknown[] };

function stubSandcastle(opts: {
    tree?: Partial<Sandcastle["tree"]>;
    node?: Partial<Sandcastle["node"]>;
    normalized?: Partial<Sandcastle["normalized"]>;
} = {}): { sc: Sandcastle; calls: Recorded[] } {
    const calls: Recorded[] = [];
    const record = <T>(method: string, args: unknown[], value: T): Promise<T> => {
        calls.push({ method, args });
        return Promise.resolve(value);
    };

    const sc = {
        tree: {
            getRoot: () => record("tree.getRoot", [], { handle: "node:root" }),
            getFocused: () => record("tree.getFocused", [], { handle: "node:focus" }),
            ...opts.tree
        },
        node: {
            getAttribute: (h: string, n: string) =>
                record("node.getAttribute", [h, n], { value: null }),
            getAttributes: (h: string, n: string[]) =>
                record("node.getAttributes", [h, n], { attributes: {} }),
            getChildren: (h: string) =>
                record("node.getChildren", [h], { children: [], total: 0 }),
            getParent: (h: string) =>
                record("node.getParent", [h], { handle: null }),
            getAncestors: (h: string) =>
                record("node.getAncestors", [h], { ancestors: [] }),
            getSibling: (h: string, d: string) =>
                record("node.getSibling", [h, d], { handle: null }),
            getActions: (h: string) =>
                record("node.getActions", [h], { actions: [] }),
            invokeAction: (h: string, a: string) =>
                record("node.invokeAction", [h, a], { ok: true }),
            setAttribute: (h: string, n: string, v: unknown) =>
                record("node.setAttribute", [h, n, v], { ok: true }),
            ...opts.node
        },
        normalized: {
            tree: {
                getRoot: () => record("normalized.tree.getRoot", [], { handle: "node:root" }),
                getFocused: () => record("normalized.tree.getFocused", [], { handle: "node:focus" })
            },
            node: {
                getAttribute: (h: string, n: string) =>
                    record("normalized.node.getAttribute", [h, n], { value: null }),
                getAttributes: (h: string, n: string[]) =>
                    record("normalized.node.getAttributes", [h, n], { attributes: {} }),
                getActions: (h: string) =>
                    record("normalized.node.getActions", [h], { actions: [] })
            },
            ...opts.normalized
        },
        stop: () => Promise.resolve()
    } as unknown as Sandcastle;

    return { sc, calls };
}

test("activeApp returns an App wrapping the frontmost handle", async () => {
    const { sc, calls } = stubSandcastle();
    const bucket = Sandbucket.wrap(sc);

    const app = await bucket.activeApp();
    assert.ok(app instanceof App);
    assert.equal(app?.handle, "node:root");
    assert.equal(calls[0].method, "tree.getRoot");
});

test("focused returns null when no element has focus", async () => {
    const { sc } = stubSandcastle({
        tree: { getFocused: () => Promise.resolve({ handle: null }) }
    });
    const bucket = Sandbucket.wrap(sc);
    assert.equal(await bucket.focused(), null);
});

test("Element.role routes through normalized getAttribute", async () => {
    // Capture the (handle, name) the stub sees and
    // confirm role() hands them to normalized
    // getAttribute (not the raw node API).
    const seen: { handle: string; name: string }[] = [];
    const { sc } = stubSandcastle({
        normalized: {
            tree: {
                getRoot: () => Promise.resolve({ handle: "node:root" }),
                getFocused: () => Promise.resolve({ handle: null })
            },
            node: {
                getAttribute: (handle: string, name: string) => {
                    seen.push({ handle, name });
                    return Promise.resolve({ value: name === "role" ? "button" : null });
                },
                getAttributes: () => Promise.resolve({ attributes: {} }),
                getActions: () => Promise.resolve({ actions: [] })
            }
        }
    });
    const bucket = Sandbucket.wrap(sc);
    const el = bucket.elementFromHandle("node:42");
    assert.equal(await el.role(), "button");
    assert.deepEqual(seen, [{ handle: "node:42", name: "role" }]);
});

test("Element.children wraps each handle in a new Element", async () => {
    const { sc } = stubSandcastle({
        node: {
            getChildren: () => Promise.resolve({ children: ["node:a", "node:b"], total: 2 }),
            getAttribute: () => Promise.resolve({ value: null }),
            getAttributes: () => Promise.resolve({ attributes: {} }),
            getParent: () => Promise.resolve({ handle: null }),
            getAncestors: () => Promise.resolve({ ancestors: [] }),
            getSibling: () => Promise.resolve({ handle: null }),
            getActions: () => Promise.resolve({ actions: [] }),
            invokeAction: () => Promise.resolve({ ok: true }),
            setAttribute: () => Promise.resolve({ ok: true })
        }
    });
    const bucket = Sandbucket.wrap(sc);
    const el = bucket.elementFromHandle("node:parent");
    const kids = await el.children();
    assert.equal(kids.length, 2);
    assert.ok(kids[0] instanceof Element);
    assert.equal(kids[0].handle, "node:a");
    assert.equal(kids[1].handle, "node:b");
});

test("Element.computeLabel falls back through name -> description -> value", async () => {
    const stages = [
        { name: "", description: "", value: 42, expected: "42" },
        { name: "", description: "Click me", value: null, expected: "Click me" },
        { name: "Submit", description: "x", value: null, expected: "Submit" }
    ];
    for (const stage of stages) {
        const { sc } = stubSandcastle({
            normalized: {
                tree: {
                    getRoot: () => Promise.resolve({ handle: "" }),
                    getFocused: () => Promise.resolve({ handle: null })
                },
                node: {
                    getAttribute: () => Promise.resolve({ value: null }),
                    getAttributes: () => Promise.resolve({
                        attributes: {
                            name: stage.name,
                            description: stage.description,
                            value: stage.value,
                            role: "button"
                        }
                    }),
                    getActions: () => Promise.resolve({ actions: [] })
                }
            }
        });
        const bucket = Sandbucket.wrap(sc);
        const el = bucket.elementFromHandle("node:x");
        assert.equal(await el.computeLabel(), stage.expected);
    }
});

test("App.resolveAtPath walks the (role, index) segments", async () => {
    // Tree: root has two children, both windows.
    // window#1 has three children, the second of
    // which is a button. resolveAtPath should find
    // it via ["window#1", "button#0"].
    const handles: Record<string, { role: string; children: string[] }> = {
        "node:root": { role: "application", children: ["node:w0", "node:w1"] },
        "node:w0": { role: "window", children: [] },
        "node:w1": { role: "window", children: ["node:t", "node:btn"] },
        "node:t": { role: "text", children: [] },
        "node:btn": { role: "button", children: [] }
    };

    const sc = {
        tree: {
            getRoot: () => Promise.resolve({ handle: "node:root" }),
            getFocused: () => Promise.resolve({ handle: null })
        },
        node: {
            getChildren: (h: string) => Promise.resolve({
                children: handles[h]?.children ?? [],
                total: handles[h]?.children.length ?? 0
            }),
            getAttribute: () => Promise.resolve({ value: null }),
            getAttributes: () => Promise.resolve({ attributes: {} }),
            getParent: () => Promise.resolve({ handle: null }),
            getAncestors: () => Promise.resolve({ ancestors: [] }),
            getSibling: () => Promise.resolve({ handle: null }),
            getActions: () => Promise.resolve({ actions: [] }),
            invokeAction: () => Promise.resolve({ ok: true }),
            setAttribute: () => Promise.resolve({ ok: true })
        },
        normalized: {
            tree: {
                getRoot: () => Promise.resolve({ handle: "node:root" }),
                getFocused: () => Promise.resolve({ handle: null })
            },
            node: {
                getAttribute: (h: string, n: string) =>
                    Promise.resolve({ value: n === "role" ? handles[h]?.role : null }),
                getAttributes: () => Promise.resolve({ attributes: {} }),
                getActions: () => Promise.resolve({ actions: [] })
            }
        },
        stop: () => Promise.resolve()
    } as unknown as Sandcastle;

    const bucket = Sandbucket.wrap(sc);
    const app = await bucket.activeApp();
    assert.ok(app);
    const target = await app.resolveAtPath(["window#1", "button#0"]);
    assert.equal(target?.handle, "node:btn");

    const missing = await app.resolveAtPath(["window#5"]);
    assert.equal(missing, undefined);
});
