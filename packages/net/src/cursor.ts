// Interactive cursor walk over the active app's
// accessibility tree. Mirrors the legacy TFCursor
// keybinds but rewires them against the new stack
// (Bluetide -> Sandcastle -> Sandbucket -> Reader).
//
// Keys:
//   e   parent      (skip ancestors with no siblings)
//   x   first child (descend through single-child chains)
//   d   next sibling
//   s   previous sibling
//   r   refocus on whatever the system says is focused
//   ?   re-announce the current element
//   q   quit (ctrl-c also exits)
//
// "Skip singleton" matches what a real screen reader
// wants: single-child containers are pass-through
// noise to a blind user; the announce-points are
// elements that actually carry a choice.
//
// Output is plain text per line. A boundary hit
// (no parent / no sibling) writes "<bell>" (ASCII 7)
// plus "(boundary)" so the terminal beeps and the
// reason is legible.

import { Bluetide } from "@cobd/bluetide";
import { Sandbucket, type Element } from "@cobd/sandbucket";
import { Reader } from "@cobd/core";

const BELL = "";

const announce = async (element: Element | null): Promise<void> => {
    if (!element) {
        process.stdout.write(`${BELL}(boundary)\n`);
        return;
    }
    const label = (await element.computeLabel()) || "<no label>";
    const role = (await element.role()) ?? "?";
    process.stdout.write(`${label}  [${role}]\n`);
};

const childrenWithSiblings = async (element: Element): Promise<Element[]> => {
    const parent = await element.parent();
    if (!parent) return [];
    return parent.children();
};

const findAncestorWithSiblings = async (element: Element): Promise<Element | null> => {
    const siblings = await childrenWithSiblings(element);
    if (siblings.length > 1) return element;
    const parent = await element.parent();
    if (!parent) return element;
    return findAncestorWithSiblings(parent);
};

const descendThroughSingletons = async (element: Element | null): Promise<Element | null> => {
    if (!element) return null;
    const children = await element.children();
    if (children.length !== 1) return element;
    return descendThroughSingletons(children[0]);
};

class Cursor {
    constructor(private readonly reader: Reader) {}

    async announceCurrent(): Promise<void> {
        await announce(this.reader.cursor);
    }

    async refocus(): Promise<void> {
        await this.reader.moveToFocused();
        await this.announceCurrent();
    }

    async up(): Promise<void> {
        const current = this.reader.cursor;
        if (!current) {
            await announce(null);
            return;
        }
        const ancestor = await findAncestorWithSiblings(current);
        const parent = ancestor ? await ancestor.parent() : null;
        if (!parent) {
            await announce(null);
            return;
        }
        await this.reader.moveToParent();
        await this.announceCurrent();
    }

    async down(): Promise<void> {
        const current = this.reader.cursor;
        if (!current) {
            await announce(null);
            return;
        }
        const first = await current.firstChild();
        const target = await descendThroughSingletons(first);
        if (!target) {
            await announce(null);
            return;
        }
        await this.reader.moveToFirstChild();
        // moveToFirstChild only steps once; walk
        // through any singleton chain manually so the
        // cursor lands on a decision point.
        let here = this.reader.cursor;
        while (here) {
            const kids = await here.children();
            if (kids.length !== 1) break;
            await this.reader.moveToFirstChild();
            here = this.reader.cursor;
        }
        await this.announceCurrent();
    }

    async right(): Promise<void> {
        const next = this.reader.cursor ? await this.reader.cursor.nextSibling() : null;
        if (!next) {
            await announce(null);
            return;
        }
        await this.reader.moveToNextSibling();
        await this.announceCurrent();
    }

    async left(): Promise<void> {
        const prev = this.reader.cursor ? await this.reader.cursor.previousSibling() : null;
        if (!prev) {
            await announce(null);
            return;
        }
        await this.reader.moveToPreviousSibling();
        await this.announceCurrent();
    }
}

const main = async (): Promise<void> => {
    process.stderr.write("net cursor: spawning bluefin-server...\n");
    const sc = await Bluetide.start();
    const { enabled } = await sc.system.isAccessibilityEnabled();
    if (!enabled) {
        process.stderr.write("net cursor: WARNING -- Accessibility NOT GRANTED. Tree will be empty.\n");
    }
    const bucket = Sandbucket.wrap(sc);
    const reader = await Reader.fromBucket(bucket);

    process.stderr.write(
        "net cursor: e=up x=down d=right s=left r=refocus ?=announce q=quit\n"
    );

    const cursor = new Cursor(reader);
    await cursor.announceCurrent();

    if (!process.stdin.isTTY) {
        process.stderr.write(
            "net cursor: stdin is not a TTY (raw key reads need a real terminal). " +
            "Run directly, eg. `npx tsx src/cursor.ts`, not piped.\n"
        );
        await reader.stop();
        process.exit(1);
    }
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    let busy = false;
    const handle = async (key: string) => {
        if (busy) return;
        busy = true;
        try {
            switch (key) {
                case "e": case "E": await cursor.up(); break;
                case "x": case "X": await cursor.down(); break;
                case "d": case "D": await cursor.right(); break;
                case "s": case "S": await cursor.left(); break;
                case "r": case "R": await cursor.refocus(); break;
                case "?":           await cursor.announceCurrent(); break;
                case "q": case "Q":
                case "":      // ctrl-c
                    process.stdin.setRawMode(false);
                    process.stdin.pause();
                    await reader.stop();
                    process.stderr.write("net cursor: bye\n");
                    process.exit(0);
                    break;
                default: break;
            }
        } catch (error) {
            process.stderr.write(`net cursor: ${error instanceof Error ? error.message : String(error)}\n`);
        } finally {
            busy = false;
        }
    };

    process.stdin.on("data", (key: string) => { void handle(key); });
};

main().catch((error) => {
    process.stderr.write(`net cursor: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
});
