import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { InstanceAttribute } from '@/lib/api.patch';
import { queryOptions } from '@tanstack/react-query';

interface GetSearchByConditionsParams extends InstanceClientIdConfig {
	enabled: boolean;
	databaseName: string;
	tableName: string;
	conditions: SearchCondition[] | null;
	sort: { attribute: string; descending: boolean; };
	pageIndex: number;
	pageSize: number;
}

type Comparator =
	| 'equals'
	| 'contains'
	| 'starts_with'
	| 'ends_with'
	| 'greater_than'
	| 'greater_than_equal'
	| 'less_than'
	| 'less_than_equal'
	| 'between';

export interface SearchCondition {
	search_attribute: string;
	search_type: Comparator;
	search_value: unknown;
}

interface SearchByConditionsRequest {
	operation: 'search_by_conditions',
	database: string;
	table: string;
	conditions: SearchCondition[];
	sort?: { attribute: string; descending: boolean; };
	offset: number;
	limit: number;
	get_attributes?: string[];
}

export function getSearchByConditionsOptions({
	enabled,
	entityId,
	instanceClient,
	databaseName,
	tableName,
	conditions,
	sort,
	pageIndex,
	pageSize,
}: GetSearchByConditionsParams) {
	// starts_with, equals, etc
	return queryOptions({
		enabled: enabled && !!conditions,
		queryKey: [
			entityId,
			'search_by_conditions',
			databaseName,
			tableName,
			conditions,
			sort.attribute || 'default',
			sort.descending || false,
			pageIndex || 0,
			pageSize || 0,
		] as const,
		staleTime: 5_000,
		// refetchInterval: 10_000,
		queryFn: () =>
			instanceClient.post<Record<string, unknown>[]>('/', {
				operation: 'search_by_conditions',
				get_attributes: ['*'],
				database: databaseName,
				table: tableName,
				conditions: conditions!,
				sort: sort.attribute.length ? sort : undefined,
				offset: pageIndex * pageSize,
				limit: pageSize,
			} satisfies SearchByConditionsRequest),
	});
}

export function translateColumnFilterToSearchCondition(key: string, value: string, attribute: InstanceAttribute | undefined): SearchCondition {
	switch (attribute?.type) {
		case 'ID':
		case 'String': {
			const anchorStart = value[value.length - 1] === '*';
			return {
				search_attribute: key,
				search_type: translateStringSearchType(anchorStart, attribute),
				search_value: translateStringSearchValue(anchorStart, value),
			};
		}
		case 'Int':
		case 'BigInt':
		case 'Long':
		case 'Float': {
			const comparator = value.match(/^[><=]+/)?.[0];
			const rawValue = comparator ? value.slice(comparator.length) : value;
			const parsed = attribute.type.includes('Int') ? parseInt(rawValue, 10) : parseFloat(rawValue);
			return {
				search_attribute: key,
				search_type: translateNumberComparator(comparator),
				search_value: parsed,
			};
		}
		case 'Date': {
			const comparator = value.match(/^[><=]+/)?.[0];
			const rawValue = comparator ? value.slice(comparator.length) : value;
			const parsed = new Date(rawValue).toISOString();
			return {
				search_attribute: key,
				search_type: translateNumberComparator(comparator),
				search_value: parsed,
			};
		}
		case 'Boolean': {
			return {
				search_attribute: key,
				search_type: 'equals',
				search_value: translateBooleanValue(value),
			};
		}
		case 'Any':
		case 'Blob':
		case 'Bytes':
		default:
			return {
				search_attribute: key,
				search_type: 'equals',
				search_value: value,
			};
	}
}

export function translateStringSearchType(anchorStart: boolean, attribute: InstanceAttribute): Comparator {
	if (anchorStart) {
		return 'starts_with';
	}
	if (attribute.type === 'ID') {
		return 'equals';
	}
	return 'equals';
}

export function translateStringSearchValue(anchorStart: boolean, value: string) {
	if (anchorStart) {
		return value.slice(0, -1);
	}
	return value;
}

export function translateNumberComparator(comparator: string | undefined): Comparator {
	switch (comparator) {
		case '>':
			return 'greater_than';
		case '>=':
			return 'greater_than_equal';
		case '<':
			return 'less_than';
		case '<=':
			return 'less_than_equal';
		default:
			return 'equals';
	}

}

const acceptedOKValues = [
	'true', 'yes', 'ok', 'yup', '1', 'si', 'bet', 'tru',
];

export function translateBooleanValue(value: string): boolean {
	const lowerValue = value.toLowerCase();
	return acceptedOKValues.includes(lowerValue);
}
