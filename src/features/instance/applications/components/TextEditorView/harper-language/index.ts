/**
 * Configures the (CDN-loaded, singleton) Monaco instance with Harper-aware
 * language support: GraphQL hover/completion, TypeScript/JavaScript Harper
 * globals + module types, and YAML schema support for component `config.yaml`.
 *
 * Monaco's language providers and worker libraries are global to the instance,
 * so this must run exactly once. The editor's `beforeMount` fires on every
 * mount, so we guard against re-registering. The guard flag lives on `globalThis`
 * rather than module scope so it survives HMR re-evaluating this module during
 * development, and rather than on the Monaco instance because the self-hosted
 * Monaco is a frozen ES module namespace that cannot be mutated.
 */
import { OnMount } from '@monaco-editor/react';
import { registerHarperGraphql } from './graphql';
import { registerHarperTypescript } from './typescript';
import { registerHarperYaml } from './yaml';

type Monaco = Parameters<OnMount>[1];

const CONFIGURED_FLAG = '__harperLanguageSupportConfigured';

export function configureHarperLanguageSupport(monaco: Monaco): void {
	const scope = globalThis as typeof globalThis & { [CONFIGURED_FLAG]?: boolean };
	if (scope[CONFIGURED_FLAG]) {
		return;
	}
	scope[CONFIGURED_FLAG] = true;

	registerHarperGraphql(monaco);
	registerHarperTypescript(monaco);
	registerHarperYaml(monaco);
}
