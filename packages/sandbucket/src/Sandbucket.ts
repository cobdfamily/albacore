// Top-level handle: owns a Sandcastle instance,
// hands out typed Element / App objects. Most
// callers just want `Sandbucket.start()` and then
// `bucket.activeApp()` / `bucket.focused()`. The
// underlying Sandcastle is exposed via `.sandcastle`
// for callers (eg. tests, advanced consumers) that
// need raw protocol access.

import { Sandcastle, type SandcastleStartOptions } from "@cobd/sandcastle";
import { Element } from "./Element.js";
import { App } from "./App.js";

export class Sandbucket {
    private constructor(public readonly sandcastle: Sandcastle) {}

    static async start(options: SandcastleStartOptions = {}): Promise<Sandbucket> {
        const sandcastle = await Sandcastle.start(options);
        return new Sandbucket(sandcastle);
    }

    // Wrap an existing Sandcastle. Useful for tests
    // and for hosts (manila's main process) that want
    // to own the spawn lifecycle separately.
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
