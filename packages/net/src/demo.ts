// End-to-end demo for the Albacore screen-reader
// stack. Spawns bluefin-server via @cobd/bluetide,
// wraps it in @cobd/sandbucket + @cobd/core, then
// dumps a one-pass status snapshot of whatever app
// is currently frontmost. No interactive cursor
// (cli.js used to do that; rewriting on the new
// chain comes later) -- this is the first concrete
// proof that the whole stack runs.
//
// Run with `npm run demo` from this package. The
// bluefin-server binary must be built first
// (`swift build` in Tuna/bluefin/swift).

import { Bluetide } from "@cobd/bluetide";
import { Sandbucket } from "@cobd/sandbucket";
import { Reader } from "@cobd/core";

const main = async (): Promise<void> => {
    process.stderr.write("net: spawning bluefin-server...\n");
    const sc = await Bluetide.start();

    process.stderr.write(
        `net: connected to ${sc.welcome.server} ${sc.welcome.version}\n`
    );

    // Verify AX permission state up front so the
    // operator sees an explicit GRANTED / WARNING
    // line instead of "why are the names null?".
    const { enabled } = await sc.system.isAccessibilityEnabled();
    process.stderr.write(
        `net: accessibility ${enabled ? "GRANTED" : "WARNING -- NOT GRANTED"}\n`
    );

    const bucket = Sandbucket.wrap(sc);
    const reader = await Reader.fromBucket(bucket);

    const app = await reader.activeApp();
    if (app) {
        const name = await app.name();
        const role = await app.role();
        process.stdout.write(`Active app: ${name ?? "?"} [${role ?? "?"}]\n`);
    } else {
        process.stdout.write("Active app: <none>\n");
    }

    const cursor = reader.cursor;
    if (cursor) {
        const label = await cursor.computeLabel();
        const role = await cursor.role();
        process.stdout.write(`Focused:    ${label || "<no label>"} [${role ?? "?"}]\n`);
    } else {
        process.stdout.write("Focused:    <nothing focused>\n");
    }

    const battery = await sc.system.getBatteryStatus();
    if (battery.isPresent && battery.percentage !== null) {
        const charging = battery.isCharging ? "charging" : "not charging";
        process.stdout.write(
            `Battery:    ${battery.percentage.toFixed(0)}% (${charging})\n`
        );
    } else {
        process.stdout.write("Battery:    <no battery>\n");
    }

    await reader.stop();
    process.stderr.write("net: done\n");
};

main().catch((error) => {
    process.stderr.write(`net: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
});
