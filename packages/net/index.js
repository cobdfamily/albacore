// Tuna/net demo -- exercises a handful of @cobd/bluefin
// surfaces end-to-end so the framework's behavior can
// be inspected from a Node REPL. Not a library; intended
// to be edited freely while iterating on bluefin.
//
//   UIApp('active')       -- attach to whatever app
//                            currently owns focus
//   .activeElement        -- walks parent + reads role
//   System.getBatteryPercentage / getIsCharging
//                         -- bluefin's power probes

import { Accessibility, Elements, System } from '@cobd/bluefin';

let app = new Elements.UIApp( 'active' );
app.activeElement = app.activeElement.parentNode;

console.log( app.activeElement.role );



console.log( `Battery: ${System.getBatteryPercentage()}% - ${(System.getIsCharging() ? "Charging":"Not Charging")}` );


setInterval( () => {
let title = "me";

}, 2000 );

