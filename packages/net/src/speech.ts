// Web Speech API shim backed by the espeak / espeak-ng
// command-line synthesizer. Surface is intentionally a
// near-clone of the browser SpeechSynthesis API so
// upstream consumers can read it without re-learning
// anything.
//
// Implemented today:
//   speechSynthesis.speak(utterance)
//   speechSynthesis.cancel()
//   speechSynthesis.speaking
//   speechSynthesis.pending
//   new SpeechSynthesisUtterance(text)
//     .text  .rate  .pitch  .volume  .voice
//     .onend  .onerror
//
// Not implemented yet (no consumer asks for them):
//   getVoices(), voiceschanged event, pause/resume,
//   onstart / onboundary / onmark / onpause / onresume,
//   utterance.lang.
//
// Falls back to a simple "[speech] <text>" stderr
// print when neither espeak-ng nor espeak is on PATH,
// so consumers can run anywhere without TTS being
// load-bearing.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter } from "node:path";

const ESPEAK_CANDIDATES = ["espeak-ng", "espeak"];

const findEspeak = (): string | null => {
    const exts = process.platform === "win32" ? [".exe", ".bat", ".cmd"] : [""];
    const paths = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
    for (const candidate of ESPEAK_CANDIDATES) {
        for (const p of paths) {
            for (const ext of exts) {
                if (existsSync(`${p}/${candidate}${ext}`)) return candidate;
            }
        }
    }
    return null;
};

const ESPEAK = findEspeak();

type UtteranceEventListener = () => void;
type UtteranceErrorListener = (error: Error) => void;

export class SpeechSynthesisUtterance {
    text: string;
    rate = 1.0;        // 0.1 - 10 in spec; we just multiply espeak's default 175 wpm
    pitch = 1.0;       // 0 - 2; multiplied against espeak's default pitch 50 (clamped 0..99)
    volume = 1.0;      // 0 - 1; multiplied against espeak's default amplitude 100 (clamped 0..200)
    voice: string | null = null;   // espeak voice id, eg. "en+f3"
    onend: UtteranceEventListener | null = null;
    onerror: UtteranceErrorListener | null = null;

    constructor(text = "") {
        this.text = text;
    }
}

export class SpeechSynthesis {
    #current: ChildProcess | null = null;
    #queue: SpeechSynthesisUtterance[] = [];

    get speaking(): boolean {
        return this.#current !== null;
    }

    get pending(): boolean {
        return this.#queue.length > 0;
    }

    speak(utterance: SpeechSynthesisUtterance): void {
        this.#queue.push(utterance);
        this.#tick();
    }

    cancel(): void {
        this.#queue = [];
        if (this.#current) {
            this.#current.kill();
            this.#current = null;
        }
    }

    #tick(): void {
        if (this.#current) return;
        const next = this.#queue.shift();
        if (!next) return;

        if (!ESPEAK) {
            process.stderr.write(`[speech] ${next.text}\n`);
            queueMicrotask(() => {
                next.onend?.();
                this.#tick();
            });
            return;
        }

        // Web Speech rate is "1.0 = normal"; espeak's
        // default is 175 wpm. Span clamped to espeak's
        // 80..450 acceptable range.
        const rate = Math.round(175 * next.rate);
        const clampedRate = Math.max(80, Math.min(450, rate));
        // pitch: Web Speech 0..2 around 1.0; espeak
        // -p is 0..99 default 50.
        const pitch = Math.max(0, Math.min(99, Math.round(50 * next.pitch)));
        // volume: Web Speech 0..1; espeak -a is
        // 0..200 default 100.
        const amplitude = Math.max(0, Math.min(200, Math.round(100 * next.volume)));

        const args = [
            "-s", String(clampedRate),
            "-p", String(pitch),
            "-a", String(amplitude)
        ];
        if (next.voice) args.push("-v", next.voice);
        args.push(next.text);

        this.#current = spawn(ESPEAK, args, { stdio: "ignore" });

        this.#current.once("exit", (code) => {
            this.#current = null;
            if (code === 0) next.onend?.();
            else next.onerror?.(new Error(`${ESPEAK} exited with ${code ?? "null"}`));
            this.#tick();
        });
        this.#current.once("error", (error) => {
            this.#current = null;
            next.onerror?.(error);
            this.#tick();
        });
    }
}

// Inspectable so consumers can branch on it (eg. log
// a one-time warning if no synthesizer is present).
export const speechBackend: { binary: string | null } = { binary: ESPEAK };

export const speechSynthesis = new SpeechSynthesis();
