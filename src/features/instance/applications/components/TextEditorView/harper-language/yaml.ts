/**
 * Harper-aware YAML support for the Applications editor. Unlike JSON, Monaco has
 * no built-in schema support for YAML, so we use `monaco-yaml` (a real YAML
 * language service backed by JSON Schema) to validate, complete, and document
 * Harper component `config.yaml` files against Harper's `config-app.schema.json`.
 *
 * The YAML worker (and all other Monaco workers) is provided by the self-hosted
 * Monaco setup in `@/lib/monaco/setup`; this module only registers the schema.
 *
 * Source of truth: node_modules/harper/config-app.schema.json, copied to
 * ./configAppSchema.json (the `harper` package only exposes `.`). Refresh the
 * copy when the bundled harper version changes its app config schema.
 */
import { Monaco } from '@/lib/monaco/types';
import { configureMonacoYaml } from 'monaco-yaml';
import configAppSchemaRaw from './configAppSchema.json?raw';

const configAppSchema = JSON.parse(configAppSchemaRaw);

const SCHEMA_URI = 'harper://schemas/config-app.json';

/**
 * Configure monaco-yaml with the Harper app-config schema, scoped to
 * `config.yaml` files. monaco-yaml is global and may only be configured once,
 * so this is gated by the idempotent caller in `./index`.
 */
export function registerHarperYaml(monaco: Monaco): void {
	configureMonacoYaml(monaco as Parameters<typeof configureMonacoYaml>[0], {
		enableSchemaRequest: false,
		validate: true,
		hover: true,
		completion: true,
		schemas: [
			{
				uri: SCHEMA_URI,
				fileMatch: ['**/config.yaml', '*config.yaml', 'config.yaml'],
				schema: configAppSchema,
			},
		],
	});
}
