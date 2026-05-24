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

    // The application element is the root of its AX
    // tree -- it never has a parent. Overriding so
    // callers walking up don't fall off into the
    // system-wide element (which we deliberately
    // don't expose).
    async parent(): Promise<Element | null> {
        return null;
    }

    // Whatever the app currently considers focused.
    // The same data the cursor lands on after a
    // `r`efocus -- but reachable from an App handle
    // without going back through Sandbucket.
    async activeElement(): Promise<Element | null> {
        const { value } = await this.sandcastle.node.getAttribute(
            this.handle, "AXFocusedUIElement"
        );
        return typeof value === "string" ? new Element(value, this.sandcastle) : null;
    }

    // Set focus to an element inside this app. Ports
    // the legacy UIApp.activeElement setter: if the
    // target is a window, raise it; otherwise raise
    // the enclosing window first, then point the
    // app's AXFocusedUIElement at the target. The
    // window-raise matters because focusing a
    // background-window descendant otherwise does
    // nothing visible to the user.
    async setActiveElement(element: Element): Promise<void> {
        if ((await element.role()) === "window") {
            await element.invoke("AXRaise");
        } else {
            const window = await element.window();
            if (window) await window.invoke("AXRaise");
        }
        await this.sandcastle.node.setAttribute(
            this.handle, "AXFocusedUIElement", element.handle
        );
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
