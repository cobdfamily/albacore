// Top-level handle: wraps a Sandcastle and hands
// out typed Element / App objects. Sandbucket
// itself does not spawn anything -- the caller
// brings a Sandcastle (typically via
// `Bluetide.start()` on Node, or an IPC-bridge
// Sandcastle inside a browser renderer). Keeping
// the spawn out of here keeps sandbucket safe to
// bundle for the browser.

import type { Sandcastle } from "@cobd/sandcastle";
import { Element } from "./Element.js";
import { App } from "./App.js";

export class Sandbucket {
    private constructor(public readonly sandcastle: Sandcastle) {}

    // Wrap an already-connected Sandcastle. The host
    // owns the spawn / IPC lifecycle.
    //
    //   const sc = await Bluetide.start();
    //   const bucket = Sandbucket.wrap(sc);
    static wrap(sandcastle: Sandcastle): Sandbucket {
        return new Sandbucket(sandcastle);
    }

    async activeApp(): Promise<App | null> {
        const root = await this.sandcastle.tree.getRoot();
        return root.handle ? new App(root.handle, this.sandcastle) : null;
    }

    async focused(): Promise<Element | null> {
        const focused = await this.sandcastle.tree.getFocused();
        return focused.handle ? new Element(focused.handle, this.sandcastle) : null;
    }

    elementFromHandle(handle: string): Element {
        return new Element(handle, this.sandcastle);
    }

    async stop(): Promise<void> {
        await this.sandcastle.stop();
    }
}
