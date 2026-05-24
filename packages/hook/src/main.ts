// Hook bootstrap. Loaded by index.html in any
// browser-capable shell. Today it just instantiates
// a Reader against a placeholder Transport so we
// can prove the wiring end-to-end in the bundled
// output. Phase E swaps in a real Transport that
// bridges to sandcastle (via Electron IPC inside
// manila, or whatever transport a non-Electron host
// supplies).

import { Reader, type Transport } from "@cobd/core";

const stubTransport: Transport = {
    async request<T>(method: string): Promise<T> {
        console.warn(`@cobd/hook: stub Transport got "${method}" with no host wiring`);
        return {} as T;
    },
    on() {
        return () => undefined;
    },
};

Reader.start(stubTransport).then((reader) => {
    console.log("@cobd/hook: Reader ready", reader);
});
