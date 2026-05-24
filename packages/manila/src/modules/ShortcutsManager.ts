// manila ShortcutsManager -- registers every printable
// alphanumeric key + every F-key as an Electron
// globalShortcut so the renderer can react to
// keypresses without needing focus. State machine
// tracks the last key + a repeat count for multi-tap
// gestures; an interval polls and resets the counter
// when the user stops typing.
//
// Why a fixed key list: Electron's globalShortcut API
// requires explicit registration per key -- there is
// no "all keys" subscription. The a-z + 0-9 + F1-F12
// set covers Tuna's gesture surface.

import {globalShortcut } from 'electron';

export class ShortcutsManager {

private internalManager: typeof globalShortcut;
private keys: Array<string> = [ 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9' 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12' ];
private interval;
private timer: number = 0;
private keyDown: string = "";
private keyRepeat: number = 0;

constructor()
{
this.internalManager = globalShortcut;
this.init();
}

private init(): void {
this.internalManager.register( '`', () => {
this.loadShortcuts();
this.timer = 1000;
if( this.interval ) clearInterval( this.interval );
this.interval = setInterval( () => {
this.timer -= 250;
if( this.timer === 0 )
{

if( this.keyDown != "" )
{
this.fireEvent();
}

clearInterval( this.interval );
this.unloadShortcuts();
}

}, 250 );

} );

};

private loadShortcuts(): void {
for( const key of this.keys )
{
this.internalManager.register( key, () => {
this.timer = 500;
this.keyDown = key;

if( this.keyRepeat < 4 )
{
this.keyRepeat++;
}
else
{
this.keyRepeat = 1;
}

} );
}

};

public unloadShortcuts(): void {

for( const key of this.keys )
{
this.internalManager.unregister( key );
}

};

public fireEvent(): void {
console.log( this.keyDown, this.keyRepeat );
this.keyDown = "";
this.keyRepeat = 0;
};

};
