// Top-level handle: wraps a Sandcastle and hands
// out typed Element / App objects. Sandbucket
// itself does not spawn anything -- the caller
// brings a Sandcastle (typically via
// `Bluetide.start()` on Node, or an IPC-bridge
// Sandcastle inside a browser renderer). Keeping
// the spawn out of here keeps sandbucket safe to
// bundle for the browser.
//
// Sandbucket also picks the right platform binding
// at wrap() time. Today only macOS lives in
// @cobd/libbluefin; Linux (@cobd/libblackfin) and
// Windows (@cobd/libskipjack) plug in here when they
// arrive.

import type { Sandcastle } from "@cobd/sandcastle";
import * as libbluefin from "@cobd/libbluefin";

export type PlatformLibrary = typeof libbluefin;

// Server name (from welcome.server) -> platform
// binding. Add entries as more *fin servers + their
// TS counterparts come online.
const SERVER_TO_LIB: Record<string, PlatformLibrary> = {
    "bluefin-swift": libbluefin
};

export class Sandbucket {
    private constructor(
        public readonly sandcastle: Sandcastle,
        public readonly lib: PlatformLibrary
    ) {}

    // Wrap an already-connected Sandcastle. The host
    // owns the spawn / IPC lifecycle.
    //
    //   const sc = await Bluetide.start();
    //   const bucket = Sandbucket.wrap(sc);
    //
    // An explicit lib can be passed in to override the
    // welcome-based lookup (useful for tests, future
    // shared *fin servers, etc).
    static wrap(sandcastle: Sandcastle, lib?: PlatformLibrary): Sandbucket {
        const resolved = lib ?? SERVER_TO_LIB[sandcastle.welcome.server];
        if (!resolved) {
            throw new Error(
                `Sandbucket: no platform library wired up for server "${sandcastle.welcome.server}". ` +
                `Known: ${Object.keys(SERVER_TO_LIB).join(", ")}. ` +
                `Pass an explicit lib argument to override.`
            );
        }
        return new Sandbucket(sandcastle, resolved);
    }

    // Passthroughs to the host-info surface so
    // consumers don't have to import @cobd/sandcastle
    // alongside sandbucket. Sandbucket stays the
    // one-stop shop: typed elements via activeApp /
    // focused, host info via system / security.
    get system(): Sandcastle["system"] {
        return this.sandcastle.system;
    }

    get security(): Sandcastle["security"] {
        return this.sandcastle.security;
    }

    get welcome(): Sandcastle["welcome"] {
        return this.sandcastle.welcome;
    }

    async activeApp(): Promise<InstanceType<PlatformLibrary["App"]> | null> {
        const root = await this.sandcastle.tree.getRoot();
        return root.handle ? new this.lib.App(root.handle, this.sandcastle) : null;
    }

    async focused(): Promise<InstanceType<PlatformLibrary["Element"]> | null> {
        const focused = await this.sandcastle.tree.getFocused();
        return focused.handle ? new this.lib.Element(focused.handle, this.sandcastle) : null;
    }

    elementFromHandle(handle: string): InstanceType<PlatformLibrary["Element"]> {
        return new this.lib.Element(handle, this.sandcastle);
    }

    async stop(): Promise<void> {
        await this.sandcastle.stop();
    }
}
