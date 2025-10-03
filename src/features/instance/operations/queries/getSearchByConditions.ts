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
			const { comparator, rawNumber } = parseNumericalComparator(value);
			const parsed = attribute.type.includes('Int') ? parseInt(rawNumber, 10) : parseFloat(rawNumber);
			if (isNaN(parsed)) {
				throw new Error(`${rawNumber} does not appear to be a valid number.`);
			}
			return {
				search_attribute: key,
				search_type: comparator,
				search_value: parsed,
			};
		}
		case 'Date': {
			const { comparator, rawNumber } = parseNumericalComparator(value);
			const parsed = new Date(rawNumber).toISOString();
			return {
				search_attribute: key,
				search_type: comparator,
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

const comparatorNumericalPrefixMappings: Record<string, Comparator> = {
	// greater than
	'>': 'greater_than',
	'g': 'greater_than',
	'gt': 'greater_than',
	'greater': 'greater_than',
	'greaterthan': 'greater_than',

	// greater than or equals
	'>=': 'greater_than_equal',
	'ge': 'greater_than_equal',
	'gte': 'greater_than_equal',
	'greaterorequal': 'greater_than_equal',
	'greaterthanequal': 'greater_than_equal',
	'greaterthanorequal': 'greater_than_equal',

	// equals
	'===': 'equals',
	'==': 'eq',
	'=': 'eq',
	'equals': 'equals',
	'equal': 'equals',
	'eq': 'eq',

	// not equals
	'!==': 'not_equal',
	'!=': 'ne',
	'notequals': 'not_equal',
	'notequal': 'not_equal',
	'ne': 'ne',

	// less than
	'<': 'less_than',
	'l': 'less_than',
	'lt': 'less_than',
	'less': 'less_than',
	'lessthan': 'less_than',

	// less than or equals
	'<=': 'less_than_equal',
	'lte': 'less_than_equal',
	'le': 'less_than_equal',
	'lessorequal': 'less_than_equal',
	'lessthanequal': 'less_than_equal',
	'lessthanorequal': 'less_than_equal',
}

export function parseNumericalComparator(value: string): { comparator: Comparator, rawNumber: string } {
	const simpleOperator = value.toLowerCase().trim().match(/^([><=a-z_ ]+)([\d._TZ-]+)$/);
	if (simpleOperator) {
		const prefix = simpleOperator[1]
			.replace(/[_ ]+/g, '')
			.replace(/^([a-z]+)=$/g, '$1');
		const number = simpleOperator[2];
		const mappedComparator = comparatorNumericalPrefixMappings[prefix];
		if (!mappedComparator) {
			throw new Error(`${prefix} is not a known operator; please use <, <=, >, >=, ==, or !=`);
		}
		return {
			comparator: mappedComparator,
			rawNumber: number,
		};
	}
	// TODO: Support between.
	return {
		comparator: 'equals',
		rawNumber: value,
	};
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
