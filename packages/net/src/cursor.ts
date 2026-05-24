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
// Boundaries (no parent / no sibling) play a short
// low square-wave tone through the @cobd/net audio
// shim, which spawns ffplay under the hood.

import { Bluetide } from "@cobd/bluetide";
import { Sandbucket, type Element } from "@cobd/sandbucket";
import { Reader } from "@cobd/core";
import { AudioContext, audioBackend } from "./audio.js";

const audio = new AudioContext();

const boundary = async (): Promise<void> => {
    process.stdout.write("(boundary)\n");
    await audio.beep({ frequency: 220, durationMs: 80, type: "square" });
};

const announce = async (element: Element | null): Promise<void> => {
    if (!element) {
        await boundary();
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
            await boundary();
            return;
        }
        const ancestor = await findAncestorWithSiblings(current);
        const parent = ancestor ? await ancestor.parent() : null;
        if (!parent) {
            await boundary();
            return;
        }
        await this.reader.moveToParent();
        await this.announceCurrent();
    }

    async down(): Promise<void> {
        const current = this.reader.cursor;
        if (!current) {
            await boundary();
            return;
        }
        const first = await current.firstChild();
        if (!first) {
            await boundary();
            return;
        }
        await this.reader.moveToFirstChild();
        // Walk through any singleton chain manually so
        // the cursor lands on a decision point.
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
            await boundary();
            return;
        }
        await this.reader.moveToNextSibling();
        await this.announceCurrent();
    }

    async left(): Promise<void> {
        const prev = this.reader.cursor ? await this.reader.cursor.previousSibling() : null;
        if (!prev) {
            await boundary();
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
        process.stderr.write(
            "net cursor: WARNING -- Accessibility NOT GRANTED. Tree will be empty.\n"
        );
    }
    if (!audioBackend.ffplay) {
        process.stderr.write(
            "net cursor: ffplay not found on PATH; boundary beeps will fall back to terminal bell.\n"
        );
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
            process.stderr.write(
                `net cursor: ${error instanceof Error ? error.message : String(error)}\n`
            );
        } finally {
            busy = false;
        }
    };

    process.stdin.on("data", (key: string) => { void handle(key); });
};

main().catch((error) => {
    process.stderr.write(
        `net cursor: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
});
