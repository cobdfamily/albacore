// Wraps Electron's globalShortcut with a debounce that
// counts presses inside a 250 ms window. The screen
// reader fires multi-tap gestures (one-press / two-press
// / three-press) on the same shortcut, so we forward
// (shortcut, bounces) to the renderer via the
// "TFKeyboard" IPC message after the press settle
// interval. Bounce counter caps at 3 then wraps modulo
// 3 so a long held key doesn't blow past the gesture
// table.

import { globalShortcut } from "electron";

export class Keyboard {

public window: any|null = null;

constructor( window: any )
{
this.window = window;
}

public debounceWithDelayAndShortcut( callback: ( args: unknown ) => void, delay: number, shortcut: string ): () => void {
    let timeout: any;
    let bounces: number = 0;

    return () => {
        clearTimeout( timeout );

bounces++;

if( bounces > 3 )
{
bounces = bounces-3;
}

        timeout = setTimeout( function() {
            callback( { bounces: bounces, shortcut: shortcut } );
            bounces = 0;
}, delay );
    }

}

public registerShortcutWithModifier( shortcut: string, modifier: string ): boolean {

let delay = 250;

if(
globalShortcut.register( `${modifier}+${shortcut}`, this.debounceWithDelayAndShortcut( ( args: any ) => {

if( this.window && this.window.webContents )
{
this.window.webContents.send( 'message', { type: "TFKeyboard", args: args } );
}

}, delay, shortcut ) )
)
{
return true;
}
return false;
}

}
