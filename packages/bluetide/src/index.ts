import { spawn as nodeSpawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
    ChildProcessWithoutNullStreams,
    SpawnOptionsWithoutStdio
} from "node:child_process";
import { Sandcastle } from "@cobd/sandcastle";

// Maps Node's process.platform string to the *fin
// server binary built for it. process.platform uses
// 'win32' (not 'windows'), 'darwin' for macOS, and
// 'linux' for Linux -- those are the only three the
// Albacore stack targets today.
const FIN_BY_PLATFORM: Record<string, string> = {
    darwin: "bluefin-server",
    linux: "blackfin-server",
    win32: "skipjack-server.exe"
};

export type SpawnServer = (
    command: string,
    args: string[],
    options: SpawnOptionsWithoutStdio
) => ChildProcessWithoutNullStreams;

export type BluetideStartOptions = {
    binaryPath?: string;
    spawn?: SpawnServer;
    welcomeTimeoutMs?: number;
};

export const Bluetide = {
    async start(options: BluetideStartOptions = {}): Promise<Sandcastle> {
        const binaryPath = options.binaryPath ?? resolveFinServerPath();
        const spawnServer = options.spawn ?? defaultSpawnServer;
        const child = spawnServer(binaryPath, [], { stdio: "pipe" });

        return Sandcastle.connect({
            input: child.stdout,
            output: child.stdin,
            welcomeTimeoutMs: options.welcomeTimeoutMs,
            // Sandcastle calls onStop from stop().
            // We end stdin first (signals clean
            // shutdown) then send kill in case the
            // child ignores EOF.
            onStop: () => {
                child.stdin.end();
                child.kill();
            },
            // Sandcastle uses exit to know when to
            // reject in-flight requests with a
            // descriptive error.
            exit: new Promise((resolveExit) => {
                child.once("exit", (code, signal) =>
                    resolveExit({ code, signal: signal ?? null })
                );
            })
        });
    }
};

export function resolveFinServerPath(): string {
    if (process.env.FIN_SERVER_PATH) {
        return process.env.FIN_SERVER_PATH;
    }
    // Legacy alias kept while existing dev muscle
    // memory still types BLUEFIN_SERVER_PATH. Remove
    // when nothing in the workspace references it.
    if (process.env.BLUEFIN_SERVER_PATH) {
        return process.env.BLUEFIN_SERVER_PATH;
    }

    const binary = FIN_BY_PLATFORM[process.platform];
    if (!binary) {
        throw new Error(
            `No *fin server is wired up for platform "${process.platform}". ` +
            `Supported: ${Object.keys(FIN_BY_PLATFORM).join(", ")}.`
        );
    }

    const moduleDir = dirname(fileURLToPath(import.meta.url));
    const packageDir = moduleDir.endsWith("/src") || moduleDir.endsWith("/dist")
        ? dirname(moduleDir)
        : moduleDir;
    // Consolidated Tuna/bluefin layout has the Swift
    // package under bluefin/swift/.
    const devPath = resolve(packageDir, "../../../bluefin/swift/.build/debug", binary);
    if (existsSync(devPath)) return devPath;

    throw new Error(
        `Could not find ${binary} for platform "${process.platform}". ` +
        `Searched: ${devPath}. ` +
        `Build the *fin server or set FIN_SERVER_PATH to override.`
    );
}

function defaultSpawnServer(
    command: string,
    args: string[],
    options: SpawnOptionsWithoutStdio
): ChildProcessWithoutNullStreams {
    return nodeSpawn(command, args, options);
}
