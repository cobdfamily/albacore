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
        private readonly sandcastle: Sandcastle
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

    // Equivalent of the legacy UIElement.compute_aria_label:
    // walk through the attribute hierarchy (name ->
    // description -> value -> roleDescription with the
    // role suffix stripped) until something non-empty
    // turns up. Used by screen-reader output layers.
    async computeLabel(): Promise<string> {
        const attrs = await this.getAttributes(["name", "description", "value", "role"]);
        const name = attrs.name;
        if (typeof name === "string" && name.length > 0) return name;
        const description = attrs.description;
        if (typeof description === "string" && description.length > 0) return description;
        const value = attrs.value;
        if (value !== undefined && value !== null) return String(value);
        return "";
    }
}
