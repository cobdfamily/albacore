// @cobd/core -- the shell-agnostic screen-reader
// library. Runs in any TS/JS environment (browser
// renderer via @cobd/hook, Node via @cobd/net, or
// anywhere else with a compatible Sandbucket).
//
// Core wraps a Sandbucket and exposes the navigation
// + state surface that screen-reader logic builds
// on. Phase E layers narration / key routing /
// gesture state on top of this. For now Reader is
// a thin surface (current node + move helpers) so
// hosts can drive the wiring end-to-end.

import { Sandbucket, Element, App } from "@cobd/sandbucket";

export { Sandbucket, Element, App } from "@cobd/sandbucket";

export class Reader {
    private current: Element | null = null;

    private constructor(public readonly bucket: Sandbucket) {}

    // Hosts hand in a Sandbucket they constructed.
    // No spawn happens here: this keeps core safe to
    // bundle for the browser (Electron renderer / web
    // host). Node consumers (net, manila's main) wire
    // the spawn via @cobd/bluetide:
    //
    //   const sc = await Bluetide.start();
    //   const bucket = Sandbucket.wrap(sc);
    //   const reader = await Reader.fromBucket(bucket);
    static async fromBucket(bucket: Sandbucket): Promise<Reader> {
        const reader = new Reader(bucket);
        reader.current = await bucket.focused();
        return reader;
    }

    get cursor(): Element | null {
        return this.current;
    }

    // For callers (like net's Cursor) that compute
    // the destination element themselves via the
    // Element API instead of through Reader's
    // step-at-a-time moves. The single-step moves
    // stay for simple cases; setCursor is the
    // escape hatch for skip-singleton / drill
    // navigation.
    setCursor(element: Element | null): void {
        this.current = element;
    }

    async moveToFocused(): Promise<Element | null> {
        this.current = await this.bucket.focused();
        return this.current;
    }

    async moveToFirstChild(): Promise<Element | null> {
        if (!this.current) return null;
        this.current = await this.current.firstChild();
        return this.current;
    }

    async moveToParent(): Promise<Element | null> {
        if (!this.current) return null;
        this.current = await this.current.parent();
        return this.current;
    }

    async moveToNextSibling(): Promise<Element | null> {
        if (!this.current) return null;
        this.current = await this.current.nextSibling();
        return this.current;
    }

    async moveToPreviousSibling(): Promise<Element | null> {
        if (!this.current) return null;
        this.current = await this.current.previousSibling();
        return this.current;
    }

    async activeApp(): Promise<App | null> {
        return this.bucket.activeApp();
    }

    async stop(): Promise<void> {
        await this.bucket.stop();
    }
}
