// Tuna/net cli -- TFCursor demo. Subscribes to every
// bluefin event (Events.bus.on('all', ...)), boots the
// UI manager, then implements a 4-direction tree-walk
// cursor over the active app's accessibility tree
// (e=up, x=down, d=right, s=left; q=quit).
//
// Skip-singleton-chains: moveDown/Left/Right/Up walks
// past elements with no siblings -- "single-child"
// containers are noise to a screen-reader user; they
// don't carry decision points. Hitting an actual
// boundary (no parent / no sibling) emits a beep via
// ScreenReader.setOutput('beep').
//
// Demo-grade tooling: raw stdin in raw mode, no
// terminal-handling library.

import { Elements, Events, UI, ScreenReader } from '@cobd/bluefin';


Events.bus.on( 'all', console.log );

Events.bus.start();

UI.load();

class TFCursor {

boundryReached()
{
ScreenReader.setOutput( 'beep' );
};

findAncestorWithSiblings( element ) {
if( element.hasSiblings() || !element.parentNode ) return element;
return this.findAncestorWithSiblings( element.parentNode );
};

findDescendentWithChildren( element ) {
if( !element ) return undefined;
if( element.hasSiblings() || element.children.length == 0 ) return element;
return this.findDescendentWithChildren( element.firstChild );
};

 moveDown()
{
let element = UI.getManager().app.activeElement;
let firstChild = element.firstChild;
if( firstChild && !firstChild.hasSiblings() ) firstChild = this.findDescendentWithChildren( firstChild );
this.moveToElement( firstChild );
};

moveLeft()
{
let element = UI.getManager().app.activeElement;
 if( !element.hasSiblings() ) element = this.findAncestorWithSiblings( element );
let previousSibling = element.previousSibling;
if( previousSibling && previousSibling.children.length == 1 ) previousSibling = this.findDescendentWithChildren( previousSibling.firstChild );
this.moveToElement( previousSibling );
};

moveRight()
{
let element = UI.getManager().app.activeElement;
 if( !element.hasSiblings() ) element = this.findAncestorWithSiblings( element );
let nextSibling = element.nextSibling;
if( nextSibling && nextSibling.children.length == 1 ) nextSibling = this.findDescendentWithChildren( nextSibling.firstChild );
this.moveToElement( nextSibling );
};

moveUp()
{
let element = UI.getManager().app.activeElement;
let parentNode = element.parentNode;
if( parentNode && !parentNode.hasSiblings() ) parentNode = this.findAncestorWithSiblings( parentNode ).parentNode;
this.moveToElement( parentNode );
};

moveToElement( element )
{
if( element )
{
element.focus();
ScreenReader.setOutput( `${element.compute_aria_label()} ${element.compute_role()}` );
} else {
this.boundryReached();
};

};

}

let cursor = new TFCursor();

// Enable raw mode for process.stdin to read key presses immediately
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");

console.log("Press navigation keys or 'q' to exit.");

process.stdin.on("data", (key) => {
    // Detect arrow keys based on their escape sequences
    if (key === "e") {
cursor.moveUp();
    } else if (key === "x") {
cursor.moveDown();
    } else if (key === "d") {
cursor.moveRight();
    } else if (key === "s") {
cursor.moveLeft();
    } else if (key === "q") {
        // Exit on 'q' key press
        console.log("Exiting...");
        process.exit();
    }

process.stdout.write("");
});

