// Tiny Web-Audio-shaped shim. Spawns ffplay
// (ffmpeg's playback companion) for actual sound;
// the surface is intentionally a near-clone of the
// browser AudioContext / OscillatorNode shape so
// upstream consumers can read it without
// re-learning anything.
//
// Today the shim only covers what the screen-reader
// surface needs: short tones for boundary beeps and
// row/column ticks. File playback can be added when
// a consumer asks for it (`ctx.decodeAudioData` +
// `ctx.createBufferSource`).
//
// Requires `ffplay` on PATH. If it's missing we
// downgrade to the terminal bell -- audio is a nice-
// to-have, never load-bearing.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter } from "node:path";

const BELL = "";

const ffplayAvailable = (): boolean => {
    const exts = process.platform === "win32" ? [".exe", ".bat", ".cmd"] : [""];
    const paths = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
    for (const p of paths) {
        for (const ext of exts) {
            if (existsSync(`${p}/ffplay${ext}`)) return true;
        }
    }
    return false;
};

const HAS_FFPLAY = ffplayAvailable();

class AudioDestination {
    // ffplay only knows one sink (the speakers).
    // Kept so OscillatorNode.connect has somewhere
    // to land without throwing.
}

class AudioParam {
    constructor(public value: number) {}
}

export class OscillatorNode {
    readonly frequency = new AudioParam(440);
    type: "sine" | "square" | "sawtooth" | "triangle" = "sine";

    private child: ChildProcess | null = null;
    private connected: AudioDestination[] = [];

    connect(destination: AudioDestination): this {
        this.connected.push(destination);
        return this;
    }

    start(): void {
        if (this.child) return;
        if (this.connected.length === 0) return;
        if (!HAS_FFPLAY) {
            process.stderr.write(BELL);
            return;
        }
        // -nodisp: no SDL window. -autoexit: end when
        // the input ends. -loglevel quiet: ffplay
        // dumps a lot otherwise.
        // lavfi sine: synthesize a tone of the given
        // shape and frequency. Without a duration it
        // plays forever; we expect the caller to
        // .stop() it.
        const filter = `${this.type}=frequency=${this.frequency.value}`;
        this.child = spawn(
            "ffplay",
            ["-nodisp", "-autoexit", "-loglevel", "quiet", "-f", "lavfi", "-i", filter],
            { stdio: "ignore" }
        );
    }

    stop(): void {
        if (!this.child) return;
        this.child.kill();
        this.child = null;
    }
}

export class AudioContext {
    readonly destination = new AudioDestination();

    createOscillator(): OscillatorNode {
        return new OscillatorNode();
    }

    // Convenience for the common "beep for N ms"
    // case. Not part of Web Audio's surface, but
    // the shim's actual job today is "make a short
    // tone happen" and threading start/stop +
    // timeouts at every call site is friction.
    async beep(
        options: { frequency?: number; durationMs?: number; type?: OscillatorNode["type"] } = {}
    ): Promise<void> {
        const osc = this.createOscillator();
        if (options.frequency !== undefined) osc.frequency.value = options.frequency;
        if (options.type) osc.type = options.type;
        osc.connect(this.destination);
        osc.start();
        await new Promise<void>((resolve) => setTimeout(resolve, options.durationMs ?? 80));
        osc.stop();
    }
}

// Inspectable so consumers can branch on it (eg.
// log a one-time warning if HAS_FFPLAY is false).
export const audioBackend: { ffplay: boolean } = { ffplay: HAS_FFPLAY };
