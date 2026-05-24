// An Element that is also the root of an
// application's AX tree. Today the only way to
// reach an App is via Sandbucket.activeApp() ->
// the frontmost app element returned by
// tree.getRoot. Naming it "App" instead of just
// "Element" lets callers reason about scope:
// path resolution starts from an App; focus
// changes target an App.

import { Element } from "./Element.js";
import type { Sandcastle } from "@cobd/sandcastle";

export class App extends Element {
    constructor(handle: string, sandcastle: Sandcastle) {
        super(handle, sandcastle);
    }

    // Walk a path like ["window#0", "button#2"] of
    // (role, index) segments from this app's root.
    // Returns the element if every segment resolves;
    // undefined if any segment falls off the tree.
    // Ported from the legacy UIApp.resolveElementAtPath.
    async resolveAtPath(path: string[]): Promise<Element | undefined> {
        let current: Element | undefined = this;
        for (const segment of path) {
            if (!current) return undefined;
            const [role, indexString] = segment.split("#");
            const index = Number.parseInt(indexString ?? "0", 10);
            const matches: Element[] = [];
            for (const child of await current.children()) {
                if ((await child.role()) === role) matches.push(child);
            }
            current = matches[index];
        }
        return current ?? undefined;
    }
}
