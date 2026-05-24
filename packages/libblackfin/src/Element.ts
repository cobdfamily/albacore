// Linux-specific typed wrapper. Today this is a
// scaffold: methods that don't touch platform-
// specific names go through sandcastle's normalized
// layer (so they Just Work once a blackfin server
// is forwarding AT-SPI / AccessKit data). Methods
// that do (window, focus) throw "not implemented"
// until the wire server defines its equivalents.

import type { Sandcastle } from "@cobd/sandcastle";

const NOT_IMPLEMENTED = (method: string): never => {
    throw new Error(
        `@cobd/libblackfin: ${method} is not implemented yet -- the Linux *fin server still owes this method's wire-level primitives. ` +
        `Mirror the libbluefin implementation once they exist.`
    );
};

export class Element {
    constructor(
        public readonly handle: string,
        protected readonly sandcastle: Sandcastle
    ) {}

    async getAttribute(name: string): Promise<unknown> {
        const result = await this.sandcastle.normalized.node.getAttribute(this.handle, name);
        return result.value;
    }

    async getAttributes(names: string[]): Promise<Record<string, unknown>> {
        const result = await this.sandcastle.normalized.node.getAttributes(this.handle, names);
        return result.attributes;
    }

    async role(): Promise<string | undefined> {
        const value = await this.getAttribute("role");
        return typeof value === "string" ? value : undefined;
    }

    async name(): Promise<string | undefined> {
        const value = await this.getAttribute("name");
        return typeof value === "string" ? value : undefined;
    }

    async children(): Promise<Element[]> {
        const result = await this.sandcastle.node.getChildren(this.handle);
        return result.children.map((handle) => new Element(handle, this.sandcastle));
    }

    async firstChild(): Promise<Element | null> {
        const kids = await this.children();
        return kids[0] ?? null;
    }

    async parent(): Promise<Element | null> {
        const result = await this.sandcastle.node.getParent(this.handle);
        return result.handle ? new Element(result.handle, this.sandcastle) : null;
    }

    async nextSibling(): Promise<Element | null> {
        const result = await this.sandcastle.node.getSibling(this.handle, "next");
        return result.handle ? new Element(result.handle, this.sandcastle) : null;
    }

    async previousSibling(): Promise<Element | null> {
        const result = await this.sandcastle.node.getSibling(this.handle, "previous");
        return result.handle ? new Element(result.handle, this.sandcastle) : null;
    }

    async actions(): Promise<string[]> {
        const result = await this.sandcastle.normalized.node.getActions(this.handle);
        return result.actions;
    }

    async invoke(action: string): Promise<void> {
        await this.sandcastle.node.invokeAction(this.handle, action);
    }

    async getAttributeNames(): Promise<string[]> {
        const result = await this.sandcastle.node.getAttributeNames(this.handle);
        return result.names;
    }

    async window(): Promise<Element | null> {
        return NOT_IMPLEMENTED("Element.window");
    }

    async focus(): Promise<void> {
        return NOT_IMPLEMENTED("Element.focus");
    }

    async getChildrenWithRole(role: string): Promise<Element[]> {
        const kids = await this.children();
        const matched: Element[] = [];
        for (const child of kids) {
            if ((await child.role()) === role) matched.push(child);
        }
        return matched;
    }

    async hasSiblings(): Promise<boolean> {
        const parent = await this.parent();
        if (!parent) return false;
        const kids = await parent.children();
        return kids.length > 1;
    }

    async sameAs(other: Element): Promise<boolean> {
        const mine = await this.getAttributes(["role", "position", "size"]);
        const theirs = await other.getAttributes(["role", "position", "size"]);
        if (mine.role !== theirs.role) return false;
        return samePoint(mine.position, theirs.position) && sameSize(mine.size, theirs.size);
    }

    async computeLabel(): Promise<string> {
        const attrs = await this.getAttributes(["name", "description", "value", "role"]);
        const role = typeof attrs.role === "string" ? attrs.role : undefined;
        const stripRole = (label: string): string => {
            if (!role) return label;
            const suffix = ` ${role}`;
            return label.toLowerCase().endsWith(suffix.toLowerCase())
                ? label.slice(0, label.length - suffix.length)
                : label;
        };
        const name = attrs.name;
        if (typeof name === "string" && name.length > 0) return stripRole(name);
        const description = attrs.description;
        if (typeof description === "string" && description.length > 0) return stripRole(description);
        const value = attrs.value;
        if (value !== undefined && value !== null) return String(value);
        return "";
    }
}

function samePoint(a: unknown, b: unknown): boolean {
    const p = a as { x?: number; y?: number } | undefined;
    const q = b as { x?: number; y?: number } | undefined;
    if (!p || !q) return false;
    return p.x === q.x && p.y === q.y;
}

function sameSize(a: unknown, b: unknown): boolean {
    const p = a as { width?: number; height?: number } | undefined;
    const q = b as { width?: number; height?: number } | undefined;
    if (!p || !q) return false;
    return p.width === q.width && p.height === q.height;
}
