/**
 * Harper-aware JSON support for the instance configuration editor. Registers
 * Harper's config-root JSON Schema with Monaco's JSON worker so the editor
 * gets validation, key autocomplete, and hover documentation for the instance
 * configuration — the JSON analog of the Harper-aware GraphQL support in the
 * Applications editor.
 *
 * The schema is scoped (via `fileMatch`) to the config editor's model URI only,
 * so the other JSON editors in the app (table rows, role permissions) are left
 * untouched by this global registration.
 *
 * Source of truth: node_modules/harper/config-root.schema.json, copied to
 * ./configRootSchema.json. The `harper` package only exposes `.` via its
 * exports map, so we can't import the schema file directly; refresh the copy
 * when the bundled harper version changes its config schema.
 */
import { OnMount } from '@monaco-editor/react';
import configRootSchemaRaw from './configRootSchema.json?raw';

type Monaco = Parameters<OnMount>[1];

const configRootSchema = JSON.parse(configRootSchemaRaw);

/**
 * Model path (URI) for the config editor. Pass this as the `<Editor path>` prop
 * so the schema below matches it. Must stay in sync with the `fileMatch` entry.
 */
export const HARPER_CONFIG_MODEL_PATH = 'inmemory://harper/config-root.json';

const SCHEMA_URI = 'harper://schemas/config-root.json';

/**
 * Idempotently register the Harper config schema with the (singleton) Monaco
 * JSON worker. Call this from the editor's `onMount` (not `beforeMount`):
 * Monaco's JSON language initializes lazily and resets its diagnostics options
 * the first time it loads, which clobbers a schema set too early in
 * `beforeMount`. By `onMount` the JSON language is initialized, so the
 * registration sticks. The guard keys off the already-registered schema URI,
 * so repeated mounts (and HMR) are no-ops.
 */
export function configureHarperConfigEditor(monaco: Monaco): void {
	const jsonDefaults = monaco.languages.json.jsonDefaults;
	const { schemas = [], ...rest } = jsonDefaults.diagnosticsOptions;

	if (schemas.some(schema => schema.uri === SCHEMA_URI)) {
		return;
	}

	jsonDefaults.setDiagnosticsOptions({
		...rest,
		validate: true,
		enableSchemaRequest: false,
		schemas: [
			...schemas,
			{ uri: SCHEMA_URI, fileMatch: [HARPER_CONFIG_MODEL_PATH], schema: configRootSchema },
		],
	});
}
