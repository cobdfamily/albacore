// Windows-specific App. Stub today -- focus /
// active-element primitives throw until the skipjack
// server defines its equivalents (UIA SetFocus +
// window Z-order activation).

import { Element } from "./Element.js";
import type { Sandcastle } from "@cobd/sandcastle";

const NOT_IMPLEMENTED = (method: string): never => {
    throw new Error(
        `@cobd/libskipjack: ${method} is not implemented yet -- the Windows *fin server still owes this method's wire-level primitives. ` +
        `Mirror the libbluefin implementation once they exist.`
    );
};

export class App extends Element {
    constructor(handle: string, sandcastle: Sandcastle) {
        super(handle, sandcastle);
    }

    async parent(): Promise<Element | null> {
        return null;
    }

    async activeElement(): Promise<Element | null> {
        return NOT_IMPLEMENTED("App.activeElement");
    }

    async setActiveElement(_element: Element): Promise<void> {
        return NOT_IMPLEMENTED("App.setActiveElement");
    }

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
