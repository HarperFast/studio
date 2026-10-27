import { clusterPresetsEnabled } from '@/config/constants';
import type { TabVisibility } from '@/features/instance/extensions/parseStudioConfiguration';
import type { IconName } from 'lucide-react/dynamic';

/**
 * A cluster built for one job. Picked when the cluster is created; once its admin user signs in,
 * Studio deploys the preset's components and writes its `studio` config (see `PresetSetup`), so the
 * cluster opens focused on that job. Each component is a Harper-maintained package that adds its own
 * pages to Studio, so the experience ships and iterates apart from Studio itself.
 */
export interface ClusterPreset {
	id: string;
	name: string;
	description: string;
	icon: IconName;
	/** Deployed in order, each with `deploy_component`. */
	components: { project: string; package: string }[];
	/** Written to the cluster's root config as its `studio` block. */
	studio: { navigation: Record<string, TabVisibility>; landing?: string };
}

/**
 * PLACEHOLDER packages: the components themselves are still to be written. Their projects and page ids
 * match the prototype's demo manifests, so the landing keys line up once they exist.
 */
export const CLUSTER_PRESETS: readonly ClusterPreset[] = [
	{
		id: 'redirects',
		name: 'HTTP redirects',
		description: 'Serve and manage large sets of redirects at the edge, without writing an application.',
		icon: 'signpost',
		components: [{ project: 'harper-redirects', package: '@harperfast/redirects' }],
		studio: {
			navigation: { applications: 'hidden', apis: 'hidden', operations: 'hidden', status: 'tucked', logs: 'tucked' },
			landing: 'harper-redirects.redirects',
		},
	},
	{
		id: 'prerendering',
		name: 'Pre-rendering',
		description: 'Serve crawlers fully rendered HTML of your site, refreshed on a schedule.',
		icon: 'layers',
		components: [{ project: 'harper-prerender', package: '@harperfast/prerender' }],
		studio: {
			navigation: { applications: 'tucked', apis: 'hidden', operations: 'hidden' },
			landing: 'harper-prerender.prerendering',
		},
	},
];

export function findClusterPreset(id: string | undefined): ClusterPreset | undefined {
	return clusterPresetsEnabled ? CLUSTER_PRESETS.find((preset) => preset.id === id) : undefined;
}
