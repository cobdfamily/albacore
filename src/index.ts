// currentmap barrel -- re-exports the platform role-
// name translator under `roles`. Importers say:
//   import { roles } from '@cobd/currentmap';
//   roles.toNative['button']      // -> native equiv
//   roles.toAria['AXButton']      // -> 'button'
// Keeping one entry point avoids forcing consumers to
// reach into ./roles directly when more sub-modules
// land later.

export * as roles from './roles';

