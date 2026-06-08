/**
 * Configures the (CDN-loaded, singleton) Monaco instance with Harper-aware
 * language support: GraphQL hover/completion and TypeScript/JavaScript Harper
 * globals + module types.
 *
 * Monaco's language providers and worker libraries are global to the instance,
 * so this must run exactly once. The editor's `beforeMount` fires on every
 * mount, so we guard against re-registering. The guard flag lives on the Monaco
 * instance itself (which is a persistent singleton) rather than in module scope,
 * so it also survives HMR re-evaluating this module during development.
 */
import { OnMount } from '@monaco-editor/react';
import { registerHarperGraphql } from './graphql';
import { registerHarperTypescript } from './typescript';

type Monaco = Parameters<OnMount>[1];

const CONFIGURED_FLAG = '__harperLanguageSupportConfigured';

export function configureHarperLanguageSupport(monaco: Monaco): void {
	const flagged = monaco as Monaco & { [CONFIGURED_FLAG]?: boolean };
	if (flagged[CONFIGURED_FLAG]) {
		return;
	}
	flagged[CONFIGURED_FLAG] = true;

	registerHarperGraphql(monaco);
	registerHarperTypescript(monaco);
}
