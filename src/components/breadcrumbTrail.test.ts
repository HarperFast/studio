import { capitalizeWords } from '@/lib/string/capitalizeWords';
import { describe, expect, it } from 'vitest';
import { breadcrumbTrail, paramSegments } from './breadcrumbTrail';

const ORG = 'org-qpz5akmyrp1d0opj';
const CLU = 'clu-tc9pqw20vrks2zik';
const DEPLOYMENT_ID = '4ac92da3-d8a0-423e-b145-5df107957dd4';
const NAMES = { organization: 'Acme', cluster: 'prod', instance: 'node-1.prod.example.com' };

const labels = (...args: Parameters<typeof breadcrumbTrail>) => breadcrumbTrail(...args).map(({ label }) => label);

describe('breadcrumbTrail', () => {
	it('shows a deployment id in its short form, with the whole id as its title, never Title Cased', () => {
		const trail = breadcrumbTrail(
			`/${ORG}/${CLU}/config/deployments/${DEPLOYMENT_ID}`,
			'/$organizationId/$clusterId/config/deployments/$deploymentId',
			{ organizationId: ORG, clusterId: CLU, deploymentId: DEPLOYMENT_ID },
			NAMES,
		);
		expect(trail.map(({ label }) => label)).toEqual(['Acme', 'prod', 'Config', 'Deployments', '4ac92da3']);
		expect(trail.at(-1)).toEqual({
			path: `/${ORG}/${CLU}/config/deployments/${DEPLOYMENT_ID}`,
			label: '4ac92da3',
			title: DEPLOYMENT_ID,
		});
	});

	it.each([
		['users/$username', 'hdb_admin'],
		['secrets/$secretName', 'STRIPE_API_KEY'],
		['ssh-keys/$keyName', 'deploy_key'],
		['roles/$roleId', 'developer_role'],
		['certificates/$certName', 'my cert.pem'],
	])('shows a %s parameter as it was written: %s', (route, value) => {
		const [section, param] = route.split('/');
		const trail = labels(
			`/${ORG}/${CLU}/config/${section}/${encodeURIComponent(value)}`,
			`/$organizationId/$clusterId/config/${route}`,
			{ organizationId: ORG, clusterId: CLU, [param.slice(1)]: value },
			NAMES,
		);
		expect(trail.at(-1)).toBe(value);
	});

	it.each([
		['roles', 'orgRoleId', 'rol-ibx94evgjsk3q7wb'],
		['users', 'orgUserId', 'usr-4knsn0ft4e'],
	])("shows an organization's %s id as it is", (section, param, id) => {
		expect(labels(`/${ORG}/${section}/${id}`, `/$organizationId/${section}/$${param}`, {
			organizationId: ORG,
			[param]: id,
		}, NAMES)).toEqual(['Acme', capitalizeWords(section), id]);
	});

	it("Title Cases a parameter whose values are the app's own words", () => {
		expect(labels(`/${ORG}/${CLU}/edit/version`, '/$organizationId/$clusterId/edit/$mode', {
			organizationId: ORG,
			clusterId: CLU,
			mode: 'version',
		}, NAMES)).toEqual(['Acme', 'prod', 'Edit', 'Version']);
	});

	it('names an instance, and points its cluster at the cluster’s instance list', () => {
		const trail = breadcrumbTrail(
			`/${ORG}/${CLU}/instance/ins-abc123/apis`,
			'/$organizationId/$clusterId/instance/$instanceId/apis',
			{ organizationId: ORG, clusterId: CLU, instanceId: 'ins-abc123' },
			NAMES,
		);
		expect(trail).toEqual([
			{ path: `/${ORG}`, label: 'Acme' },
			{ path: `/${ORG}/${CLU}/instances`, label: 'prod' },
			{ path: `/${ORG}/${CLU}/instance/ins-abc123`, label: 'node-1' },
			{ path: `/${ORG}/${CLU}/instance/ins-abc123/apis`, label: 'APIs' },
		]);
	});

	it('falls back to generic names before the organization or cluster has loaded', () => {
		expect(labels(`/${ORG}/${CLU}/config`, '/$organizationId/$clusterId/config', {
			organizationId: ORG,
			clusterId: CLU,
		}, {})).toEqual(['Org', 'Cluster', 'Config']);
	});

	it('shows a database by its name, and a table as one crumb named for the table', () => {
		const route = '/$organizationId/$clusterId/databases/{-$databaseName}/{-$tableName}';
		expect(labels(`/${ORG}/${CLU}/databases/my_db`, route, {
			organizationId: ORG,
			clusterId: CLU,
			databaseName: 'my_db',
		}, NAMES)).toEqual(['Acme', 'prod', 'Databases', 'my_db']);
		expect(labels(`/${ORG}/${CLU}/databases/my_db/order_items`, route, {
			organizationId: ORG,
			clusterId: CLU,
			databaseName: 'my_db',
			tableName: 'order_items',
		}, NAMES)).toEqual(['Acme', 'prod', 'order_items']);
	});

	it('Title Cases segments no route declares, as before', () => {
		expect(labels('/profile/api-token', undefined, {}, NAMES)).toEqual(['Profile', 'Api Token']);
	});
});

describe('paramSegments', () => {
	it('lines a template up with the URL, taking an optional parameter only when it is present', () => {
		expect(paramSegments('/$organizationId/$clusterId/databases/{-$databaseName}/{-$tableName}', 4, {
			databaseName: 'db',
		})).toEqual(['organizationId', 'clusterId', undefined, 'databaseName']);
		expect(paramSegments('/files/$', 4, { _splat: 'a/b/c' })).toEqual([undefined, '_splat', '_splat', '_splat']);
	});
});
