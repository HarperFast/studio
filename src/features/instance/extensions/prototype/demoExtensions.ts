import type { StudioExtensionManifest } from '@/features/instance/extensions/manifest';

/**
 * PROTOTYPE ONLY: three components as they would declare themselves in their `config.yaml`, covering
 * each placement, each access style and both content kinds.
 */

const redirects: StudioExtensionManifest = {
	component: 'harper-redirects',
	pages: [{
		id: 'redirects',
		name: 'Redirects',
		icon: 'signpost',
		placement: 'tab',
		description: 'HTTP redirects served by every node before your application runs.',
		// Visible to anyone who can read the rules; add/edit/delete appear only for roles that can write.
		access: { tables: [{ database: 'redirects', table: 'Rule', actions: ['read'] }] },
		content: {
			kind: 'sections',
			sections: [
				{
					type: 'stats',
					items: [
						{ label: 'Rules', icon: 'list', value: { kind: 'count', database: 'redirects', table: 'Rule' } },
						{
							label: 'Active',
							icon: 'circle-check',
							value: { kind: 'count', database: 'redirects', table: 'Rule', where: { enabled: true } },
						},
						{ label: 'Median lookup', icon: 'timer', value: { kind: 'static', value: '0.02 ms' } },
					],
				},
				{
					type: 'table',
					title: 'Rules',
					description: 'Matched against the request path, exact first, then the longest wildcard prefix.',
					database: 'redirects',
					table: 'Rule',
					itemName: 'redirect',
					columns: [
						{ attribute: 'source', label: 'From', format: 'code' },
						{ attribute: 'target', label: 'To', format: 'code' },
						{ attribute: 'statusCode', label: 'Status', format: 'badge' },
						{ attribute: 'enabled', label: 'Enabled', format: 'boolean' },
						{ attribute: 'hits', label: 'Hits (7d)', format: 'number' },
					],
					fields: [
						{ attribute: 'source', label: 'From path', input: 'text', required: true, placeholder: '/old-path/*' },
						{
							attribute: 'target',
							label: 'To URL',
							input: 'url',
							required: true,
							placeholder: 'https://example.com/new-path',
						},
						{
							attribute: 'statusCode',
							label: 'Status code',
							input: 'select',
							defaultValue: 301,
							options: [
								{ value: 301, label: '301 Moved Permanently' },
								{ value: 302, label: '302 Found' },
								{ value: 307, label: '307 Temporary Redirect' },
								{ value: 308, label: '308 Permanent Redirect' },
							],
						},
						{ attribute: 'enabled', label: 'Enabled', input: 'switch', defaultValue: true },
						{ attribute: 'note', label: 'Note', input: 'textarea', placeholder: 'Why this redirect exists' },
					],
				},
			],
		},
	}],
};

const prerender: StudioExtensionManifest = {
	component: 'harper-prerender',
	pages: [{
		id: 'prerendering',
		name: 'Pre-rendering',
		icon: 'layers',
		placement: 'config',
		description: 'Serve crawlers fully rendered HTML, refreshed on a schedule.',
		// Settings and cache purges are cluster-wide, so the component asks for super users only.
		access: { role: 'super_user', operations: ['prerender_refresh', 'prerender_purge'] },
		content: {
			kind: 'sections',
			sections: [
				{
					type: 'form',
					title: 'Settings',
					database: 'prerender',
					table: 'Settings',
					recordId: 'default',
					fields: [
						{ attribute: 'enabled', label: 'Pre-render for crawlers', input: 'switch' },
						{
							attribute: 'origin',
							label: 'Origin',
							input: 'url',
							required: true,
							description: 'Where pages are fetched from to be rendered.',
						},
						{
							attribute: 'refreshMinutes',
							label: 'Refresh every (minutes)',
							input: 'number',
							required: true,
						},
						{
							attribute: 'userAgents',
							label: 'Crawler user agents',
							input: 'text',
							description: 'A regular expression matched against the User-Agent header.',
						},
					],
				},
				{
					type: 'actions',
					title: 'Cache',
					actions: [
						{
							label: 'Re-render all pages',
							icon: 'refresh-cw',
							request: { operation: 'prerender_refresh' },
							successMessage: 'Queued every page for rendering',
						},
						{
							label: 'Purge rendered pages',
							icon: 'trash-2',
							variant: 'destructive',
							confirm: 'Crawlers get un-rendered pages until each one is rendered again.',
							request: { operation: 'prerender_purge' },
							successMessage: 'Purged the rendered pages',
						},
					],
				},
				{
					type: 'table',
					title: 'Rendered pages',
					database: 'prerender',
					table: 'Page',
					columns: [
						{ attribute: 'path', label: 'Path', format: 'code' },
						{ attribute: 'status', label: 'Status', format: 'badge' },
						{ attribute: 'renderedAt', label: 'Rendered', format: 'datetime' },
						{ attribute: 'sizeKb', label: 'Size (KB)', format: 'number' },
					],
				},
			],
		},
	}],
};

const cacheInsights: StudioExtensionManifest = {
	component: 'cache-insights',
	pages: [{
		id: 'insights',
		name: 'Cache Insights',
		icon: 'chart-line',
		placement: 'tab',
		description: 'Hit rates by hour, and a flush through an operation the component registers.',
		access: {
			tables: [{ database: 'cache', table: 'Stat', actions: ['read'] }],
			operations: ['cache_flush'],
		},
		content: {
			kind: 'sections',
			sections: [
				{
					type: 'stats',
					items: [
						{ label: 'Hours tracked', icon: 'clock', value: { kind: 'count', database: 'cache', table: 'Stat' } },
						{ label: 'Hit rate', icon: 'gauge', value: { kind: 'static', value: '91%' } },
					],
				},
				{
					type: 'actions',
					title: 'Cache',
					actions: [{
						label: 'Flush the cache',
						icon: 'eraser',
						variant: 'destructive',
						confirm: 'Every request misses until the cache warms up again.',
						request: { operation: 'cache_flush' },
						successMessage: 'Flushed the cache',
					}],
				},
				{
					type: 'table',
					title: 'By hour',
					database: 'cache',
					table: 'Stat',
					columns: [
						{ attribute: 'hour', label: 'Hour', format: 'number' },
						{ attribute: 'hits', label: 'Hits', format: 'number' },
						{ attribute: 'misses', label: 'Misses', format: 'number' },
					],
				},
			],
		},
	}],
};

export const DEMO_EXTENSIONS: StudioExtensionManifest[] = [redirects, prerender, cacheInsights];

export const DEMO_COMPONENT_LABELS: Record<string, string> = {
	'harper-redirects': 'Redirects (tab · Studio-drawn · readers see it, writers edit)',
	'harper-prerender': 'Pre-rendering (Config · Studio-drawn · super users only)',
	'cache-insights': 'Cache Insights (tab · Studio-drawn · flush needs its operation)',
};
