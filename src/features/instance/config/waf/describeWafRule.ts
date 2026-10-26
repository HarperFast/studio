import type { WafNamedValueMatch, WafRule, WafStringOp } from '@/integrations/api/instance/waf/waf';

export const STRING_OP_LABELS: Record<WafStringOp, string> = {
	equals: 'is',
	contains: 'contains',
	prefix: 'starts with',
	regex: 'matches',
	exists: 'is present',
};

function asList(value: unknown): string[] {
	if (typeof value === 'string') {
		return [value];
	}
	return Array.isArray(value) ? value.map(String) : [];
}

function namedValue(kind: string, entry: WafNamedValueMatch): string {
	const op = STRING_OP_LABELS[entry.op] ?? entry.op;
	return entry.op === 'exists' ? `${kind} ${entry.name} ${op}` : `${kind} ${entry.name} ${op} ${entry.value ?? ''}`;
}

/**
 * One line per condition. A request must meet every line; within the IP and method lines, any one value
 * matches.
 */
export function describeWafMatch(rule: WafRule): string[] {
	const match = rule.match ?? {};
	const lines: string[] = [];
	const ip = asList(match.ip);
	if (ip.length) {
		lines.push(`IP ${ip.join(' or ')}`);
	}
	const methods = asList(match.method);
	if (methods.length) {
		lines.push(`Method ${methods.join(' or ')}`);
	}
	if (match.path?.exact != null) {
		lines.push(`Path is ${match.path.exact}`);
	}
	if (match.path?.prefix != null) {
		lines.push(`Path starts with ${match.path.prefix}`);
	}
	if (match.path?.regex != null) {
		lines.push(`Path matches ${match.path.regex}`);
	}
	for (const header of Array.isArray(match.headers) ? match.headers : []) {
		lines.push(namedValue('Header', header));
	}
	for (const parameter of Array.isArray(match.query) ? match.query : []) {
		lines.push(namedValue('Query', parameter));
	}
	if (match.ja4 != null || match.ja4h != null) {
		lines.push('TLS fingerprint (JA4)');
	}
	if (match.model != null) {
		lines.push('Model score');
	}
	if (match.agent != null) {
		lines.push('Bot (agent) identity');
	}
	return lines;
}

export function describeWafAction(rule: WafRule): string {
	switch (rule.action) {
		case 'block':
			return `Block with ${rule.blockStatus ?? 403}`;
		case 'log':
			return 'Log only';
		case 'score':
			return `Add ${rule.score ?? '?'} to the request’s score`;
		case undefined:
			return 'None';
		default:
			return `${rule.action.charAt(0).toUpperCase()}${rule.action.slice(1)}`;
	}
}

export function describeWafActivation(rule: WafRule): string {
	const activation = rule.activation;
	const parts = [
		['Nodes', asList(activation?.nodes)],
		['Regions', asList(activation?.regions)],
		['Tags', asList(activation?.tags)],
	] as const;
	const present = parts.filter(([, values]) => values.length);
	return present.length
		? present.map(([label, values]) => `${label}: ${values.join(', ')}`).join(' · ')
		: 'Every node';
}

export function describeWafProvenance(rule: WafRule): string | undefined {
	const provenance = rule.provenance;
	switch (provenance?.origin) {
		case 'human':
			return provenance.approver ? `Added by ${provenance.approver}` : 'Added by a person';
		case 'managed-feed':
			return provenance.source ? `Managed feed: ${provenance.source}` : 'Managed feed';
		case 'agent-proposed':
			return provenance.approver ? `Proposed by an agent, approved by ${provenance.approver}` : 'Proposed by an agent';
		default:
			return undefined;
	}
}
