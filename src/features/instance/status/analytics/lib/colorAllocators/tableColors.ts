// Re-exports from the existing src/lib/tableColors.ts so there's one source of
// truth for table palette. The new namespace exists for symmetry with
// typeColors and nodeColors. Disjointness against NODE_PALETTE is enforced in
// test/colorAllocators/disjoint.test.ts; if the existing palette collides,
// update src/lib/tableColors.ts directly.
export { getTableColor, OTHER_COLOR } from '../tableColors.ts';
// Import the raw palette array for the disjointness test. The existing
// src/lib/tableColors.ts must export a TABLE_PALETTE array for this to work;
// if it doesn't, update that file to export one.
export { TABLE_PALETTE } from '../tableColors.ts';
