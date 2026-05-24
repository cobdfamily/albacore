// Typed wrapper over an AX handle. Holds the
// handle plus a reference back to the Sandcastle
// instance that minted it; all methods speak
// canonical (normalized) attribute / role / action
// names -- raw AX names never leak through this
// class.
//
// Ports the navigation contract from the legacy
// Tuna/bluefin UIElement (children / parent /
// nextSibling / firstChild) but is async-only
// because the wire is async. The legacy `focus`
// path that touched global.uiManager is dropped
// here: focus belongs to whatever screen-reader
// state lives a layer up (@cobd/core).

import type { Sandcastle } from "@cobd/sandcastle";

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

    // Raw AX attribute names this element supports.
    // Ports the legacy UIElement.getAttributeNames; use
    // it when you need to discover what's actually
    // queryable on a given node before asking for it.
    async getAttributeNames(): Promise<string[]> {
        const result = await this.sandcastle.node.getAttributeNames(this.handle);
        return result.names;
    }

    // The enclosing AXWindow ancestor (eg. the
    // window that contains a button). Returns null
    // when the element has no AXWindow attribute
    // (the application root, menu-bar items, etc).
    async window(): Promise<Element | null> {
        const { value } = await this.sandcastle.node.getAttribute(this.handle, "AXWindow");
        return typeof value === "string" ? new Element(value, this.sandcastle) : null;
    }

    // Move keyboard focus to this element. Equivalent
    // to AXFocused = true on the wire. The legacy
    // UIElement.focus mutated a global UIManager;
    // sandbucket has no global state -- focus is now
    // a plain AX operation, and any screen-reader
    // tracking layer can watch the resulting
    // AXFocusedUIElementChanged notification.
    async focus(): Promise<void> {
        await this.sandcastle.node.setAttribute(this.handle, "AXFocused", true);
    }

    // Children whose canonical role matches the
    // given name. Equivalent of the legacy
    // getChildrenWithPlatformRole but takes a
    // CANONICAL role ("button") rather than a raw AX
    // role ("AXButton"); sandcastle's normalization
    // takes care of the translation.
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

    // Geometry-based equality. Two elements with the
    // same canonical role and the same (x, y) position
    // are treated as the same node even if they have
    // different opaque handles -- useful when the
    // server re-mints a handle between queries and
    // we want to know we're back where we started.
    // Ported from the legacy UIElement.matchElements.
    async sameAs(other: Element): Promise<boolean> {
        const mine = await this.getAttributes(["role", "position", "size"]);
        const theirs = await other.getAttributes(["role", "position", "size"]);
        if (mine.role !== theirs.role) return false;
        const positionMatch = samePoint(mine.position, theirs.position);
        const sizeMatch = sameSize(mine.size, theirs.size);
        return positionMatch && sizeMatch;
    }

    // Walks the attribute hierarchy (name ->
    // description -> value) for the first non-empty
    // value and returns it with a trailing role word
    // stripped. Used by screen-reader output layers.
    //
    // Why strip: macOS exposes labels like
    // "full screen button" via AXRoleDescription
    // (which our `name` fallback chain picks up).
    // Announcing the label *and* the role on top
    // gives "full screen button, button" -- the role
    // gets read twice. Stripping the trailing role
    // word yields "full screen", and the caller's
    // own role announcement carries the kind.
    //
    // Ported from the legacy bluefin TS
    // UIElement.compute_aria_label.
    async computeLabel(): Promise<string> {
        const attrs = await this.getAttributes(["name", "description", "value", "role"]);
        const role = typeof attrs.role === "string" ? attrs.role : undefined;

        const stripRole = (label: string): string => {
            if (!role || role.length === 0) return label;
            const suffix = ` ${role}`;
            if (label.toLowerCase().endsWith(suffix.toLowerCase())) {
                return label.slice(0, label.length - suffix.length);
            }
            return label;
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
