import { capitalizeWords } from '@/lib/string/capitalizeWords';

export interface BreadcrumbNames {
	organization?: string;
	cluster?: string;
	instance?: string;
}

export interface Breadcrumb {
	path: string;
	label: string;
	/** The whole value, when the label shortens it. */
	title?: string;
}

// Parameters whose values are words the app defines, not names or ids someone chose, so Title Case suits them.
const WORD_PARAMS = new Set(['mode']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPTIONAL_PARAM = /^\{-\$(\w+)\}$/;
const SPLAT = '_splat';

/**
 * The parameter each URL segment fills, by name, read from the matched route's `fullPath` (for example
 * `/$organizationId/$clusterId/config/deployments/$deploymentId`). An optional `{-$name}` segment takes a URL
 * segment only when its parameter is present.
 */
export function paramSegments(
	routePath: string | undefined,
	segmentCount: number,
	params: Record<string, unknown>,
): (string | undefined)[] {
	const names: (string | undefined)[] = [];
	let index = 0;
	for (const part of (routePath ?? '').split('/').filter(Boolean)) {
		if (index >= segmentCount) {
			break;
		}
		const optional = OPTIONAL_PARAM.exec(part);
		if (optional) {
			if (params[optional[1]] !== undefined) {
				names[index++] = optional[1];
			}
		} else if (part === '$') {
			while (index < segmentCount) {
				names[index++] = SPLAT;
			}
		} else {
			names[index++] = part.startsWith('$') ? part.slice(1) : undefined;
		}
	}
	return names;
}

function decodeSegment(segment: string): string {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

function paramLabel(name: string, value: string, names: BreadcrumbNames): Omit<Breadcrumb, 'path'> {
	switch (name) {
		case 'organizationId':
			return { label: names.organization || 'Org' };
		case 'clusterId':
			return { label: names.cluster || 'Cluster' };
		case 'instanceId':
			return { label: names.instance?.split('.')?.shift() || 'Instance' };
	}
	if (WORD_PARAMS.has(name)) {
		return { label: capitalizeWords(value) };
	}
	// Anything else is a name or an id as someone wrote it: never re-cased, and a UUID in the short form ids show
	// everywhere else.
	return UUID.test(value) ? { label: value.slice(0, 8), title: value } : { label: value };
}

/**
 * One crumb per URL segment, except the `instance` that only separates a cluster from its instance. A segment the
 * route declares as a parameter shows as its value (or, for an organization, cluster or instance, its name); only
 * the route's own words are Title Cased.
 */
export function breadcrumbTrail(
	pathname: string,
	routePath: string | undefined,
	params: Record<string, unknown>,
	names: BreadcrumbNames,
): Breadcrumb[] {
	const segments = pathname.split('/').filter(Boolean);
	const paramNames = paramSegments(routePath, segments.length, params);
	const valueAt = (index: number) => {
		const name = paramNames[index];
		const value = name && name !== SPLAT ? params[name] : undefined;
		return typeof value === 'string' ? value : decodeSegment(segments[index]);
	};
	const trail: Breadcrumb[] = [];
	for (let index = 0; index < segments.length; index++) {
		const segment = segments[index];
		const param = paramNames[index];
		if (!param && segment === 'instance') {
			continue;
		}
		let path = `/${segments.slice(0, index + 1).join('/')}`;
		if (param) {
			if (param === 'clusterId' && segments[index + 1] === 'instance') {
				path += '/instances';
			}
			trail.push({ path, ...paramLabel(param, valueAt(index), names) });
		} else if (segment === 'databases' && segments.length === index + 3) {
			trail.push({ path, label: valueAt(index + 2) });
			index += 2;
		} else {
			const label = capitalizeWords(segment);
			trail.push({ path, label: label === 'Apis' ? 'APIs' : label });
		}
	}
	return trail;
}
