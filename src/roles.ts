// Platform role-name translator for the Tuna screen
// reader. Reads ./assets/roles.csv at module load and
// exposes two lookup tables:
//   toNative -- ARIA role -> the current OS's native
//               accessibility-tree role name
//   toAria   -- native role -> the ARIA role
// The CSV has columns Aria, darwin, win32, linux. Empty
// cells mean "no equivalent on that platform" and are
// skipped, so callers always get either a string or
// undefined -- never an empty string.
//
// Read errors are logged but not thrown: a missing CSV
// shouldn't crash the consumer; the maps will just be
// empty and toAria/toNative lookups return undefined.

import fs from 'fs';
import { parse } from 'csv-parse/sync';

type RoleMapping = {
    Aria: string;
    darwin: string;
    win32: string;
    linux: string;
};

interface RoleMap {
    [key: string]: string;
}

// Platform-specific mappings, declared with let to allow modifications
let toAria: RoleMap = {};
let toNative: RoleMap = {};

// Detect platform
const platform = process.platform as 'darwin' | 'win32' | 'linux';

// Construct the URL to the CSV file in the same directory as the module
const csvFileUrl = new URL('./assets/roles.csv', import.meta.url);

// Load and parse the CSV file
function loadRoleMappings(fileUrl: URL): void {
    const fileContent = fs.readFileSync(fileUrl, 'utf-8');
    const records: RoleMapping[] = parse(fileContent, {
        columns: true,
        skip_empty_lines: true
    });

    records.forEach((row) => {
        const { Aria } = row;
        const nativeRole = row[platform];

        // Populate mappings based on platform
        if (nativeRole) {
            toNative[Aria] = nativeRole;
            toAria[nativeRole] = Aria;
        }
    });
}

try {
// Load the CSV file at module load
loadRoleMappings(csvFileUrl);
} catch( error ) {
console.error( error );
}

// Export the platform-specific mappings
export { toAria, toNative };
