import configRootSchemaRaw from './configRootSchema.json?raw';

/**
 * Harper's config-root JSON Schema, copied from `node_modules/harper/config-root.schema.json` (the `harper` package only
 * exports `.`, so the file can't be imported from there). Refresh the copy when the bundled harper version changes its
 * config schema: the raw editor validates against it, and the forms are built from it.
 */
export const configRootSchema: unknown = JSON.parse(configRootSchemaRaw);
