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
	| 'between'
	// | 'contains' // Turned off for performance reasons until we add warnings for the user.
	// | 'ends_with' // Turned off for performance reasons until we add warnings for the user.
	| 'eq'
	| 'equals'
	| 'greater_than'
	| 'greater_than_equal'
	| 'less_than'
	| 'less_than_equal'
	| 'ne'
	| 'not_equal'
	| 'starts_with';

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

export function translateColumnFilterToSearchConditions(key: string, rawValues: string, attribute: InstanceAttribute | undefined): SearchCondition[] {
	const split = rawValues.split(/ & /);
	return split.map(rawValue => translateColumnFilterToSearchCondition(key, rawValue, attribute))
}

export function translateColumnFilterToSearchCondition(key: string, rawValue: string, attribute: InstanceAttribute | undefined): SearchCondition {
	if (rawValue.startsWith(key)) {
		rawValue = rawValue.substring(key.length);
	}
	const { comparator, value } = parseComparator(rawValue);
	switch (attribute?.type) {
		case 'ID':
		case 'String': {
			return {
				search_attribute: key,
				search_type: comparator,
				search_value: value,
			};
		}
		case 'Int':
		case 'BigInt':
		case 'Long':
		case 'Float': {
			const parsed = attribute.type.includes('Int') ? parseInt(value, 10) : parseFloat(value);
			if (isNaN(parsed)) {
				throw new Error(`${value} does not appear to be a valid number.`);
			}
			return {
				search_attribute: key,
				search_type: comparator,
				search_value: parsed,
			};
		}
		case 'Date': {
			const parsed = new Date(value).toISOString();
			return {
				search_attribute: key,
				search_type: comparator,
				search_value: parsed,
			};
		}
		case 'Boolean': {
			return {
				search_attribute: key,
				search_type: comparator,
				search_value: translateBooleanValue(value),
			};
		}
		case 'Any':
		case 'Blob':
		case 'Bytes':
		default:
			return {
				search_attribute: key,
				search_type: comparator,
				search_value: value,
			};
	}
}

const comparatorEqualityPrefixMappings: Record<string, Comparator> = {
	// equals
	'=== ': 'equals',
	'== ': 'eq',
	'equals ': 'equals',
	'equal ': 'equals',
	'eq ': 'eq',

	// not equals
	'!== ': 'not_equal',
	'!= ': 'ne',
	'notequals ': 'not_equal',
	'notequal ': 'not_equal',
	'ne ': 'ne',
};

const comparatorNumericalPrefixMappings: Record<string, Comparator> = {
	// greater than
	'>': 'greater_than',
	'g': 'greater_than',
	'gt': 'greater_than',
	'=gt': 'greater_than',
	'greater': 'greater_than',
	'greaterthan': 'greater_than',

	// greater than or equals
	'>=': 'greater_than_equal',
	'ge': 'greater_than_equal',
	'=ge': 'greater_than_equal',
	'gte': 'greater_than_equal',
	'greaterorequal': 'greater_than_equal',
	'greaterthanequal': 'greater_than_equal',
	'greaterthanorequal': 'greater_than_equal',

	// less than
	'<': 'less_than',
	'l': 'less_than',
	'lt': 'less_than',
	'=lt': 'less_than',
	'less': 'less_than',
	'lessthan': 'less_than',

	// less than or equals
	'<=': 'less_than_equal',
	'lte': 'less_than_equal',
	'le': 'less_than_equal',
	'=le': 'less_than_equal',
	'lessorequal': 'less_than_equal',
	'lessthanequal': 'less_than_equal',
	'lessthanorequal': 'less_than_equal',
};

export function parseComparator(value: string): { comparator: Comparator, value: string } {
	const lowered = value.toLowerCase();

	const numericalComparator = lowered.match(/^([>=<a-z_ ]+)([\d._TZ-]+)$/);
	if (numericalComparator) {
		const prefix = numericalComparator[1]
			.replace(/[_ ]+/g, '')
			.replace(/^([a-z]+)=$/g, '$1');
		const number = numericalComparator[2];
		const mappedComparator = comparatorNumericalPrefixMappings[prefix];
		if (mappedComparator) {
			return {
				comparator: mappedComparator,
				value: number,
			};
		}
	}

	for (const equalityPrefix in comparatorEqualityPrefixMappings) {
		if (lowered.startsWith(equalityPrefix)) {
			const equalityComparator = comparatorEqualityPrefixMappings[equalityPrefix];
			return {
				comparator: equalityComparator,
				value: value.slice(equalityPrefix.length),
			};
		}
	}

	if (lowered.endsWith('*')) {
		return {
			comparator: 'starts_with',
			value: value.slice(0, -1),
		};
	}

	return {
		comparator: 'equals',
		value: value,
	};
}

const acceptedOKValues = [
	'1',
	'bet',
	'k',
	'ok',
	'si',
	'tru',
	'true',
	'yes',
	'yup',
];

export function translateBooleanValue(value: string): boolean {
	const lowerValue = value.toLowerCase();
	return acceptedOKValues.includes(lowerValue);
}
