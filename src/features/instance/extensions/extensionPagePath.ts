import type { ResolvedExtensionPage } from '@/features/instance/extensions/manifest';

/**
 * The route below the cluster that opens a component's page. The key is one encoded segment: a plugin
 * page's key holds its npm scope's `/`, which would otherwise end the segment early.
 */
export function extensionPagePath({ key, placement }: Pick<ResolvedExtensionPage, 'key' | 'placement'>): string {
	const segment = encodeURIComponent(key);
	return placement === 'config' ? `config/ext/${segment}` : `ext/${segment}`;
}
