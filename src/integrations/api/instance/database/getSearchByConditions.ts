import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import {
	GetAttribute,
	RelationshipAttributeInfo,
} from '@/features/instance/databases/functions/relationshipAttributes';
import { InstanceAttribute } from '@/integrations/api/api.patch';
import { translateKnownBooleanTypedValue } from '@/lib/boolean/translateKnownBooleanTypedValue';
import { autoCast } from '@/lib/casting/autoCast';
import { queryOptions } from '@tanstack/react-query';

interface GetSearchByConditionsParams extends InstanceClientIdConfig {
	enabled: boolean;
	databaseName: string;
	tableName: string;
	conditions: SearchCondition[] | null;
	sort: { attribute: string; descending: boolean };
	pageIndex: number;
	pageSize: number;
	onlyIfCached: boolean;
	/** Defaults to `['*']` (raw records). Pass nested selects to resolve relationship attributes. */
	getAttributes?: GetAttribute[];
	headers?: Record<string, any>;
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
	/** A single attribute, or a path into a relationship (e.g. `['owner', 'name']`) which the
	 * server executes as a join against the related table. */
	search_attribute: string | string[];
	search_type: Comparator;
	search_value: unknown;
}

interface SearchByConditionsRequest {
	operation: 'search_by_conditions';
	database: string;
	table: string;
	conditions: SearchCondition[];
	sort?: { attribute: string; descending: boolean };
	offset: number;
	limit: number;
	get_attributes?: GetAttribute[];
	onlyIfCached: boolean;
	noCacheStore: boolean;
}

export function getSearchByConditionsOptions(params: GetSearchByConditionsParams) {
	const {
		enabled,
		entityId,
		databaseName,
		tableName,
		conditions,
		sort,
		pageIndex,
		pageSize,
		onlyIfCached,
		getAttributes,
	} = params;
	// starts_with, equals, etc
	return queryOptions({
		enabled: enabled && !!conditions,
		queryKey: [
			entityId,
			databaseName,
			tableName,
			'search_by_conditions',
			conditions,
			sort.attribute || 'default',
			sort.descending || false,
			pageIndex || 0,
			pageSize || 0,
			onlyIfCached,
			getAttributes ?? null,
		] as const,
		staleTime: 60_000,
		gcTime: 5_000,
		retry: false,
		queryFn: () => getSearchByConditions(params),
	});
}

export function getSearchByConditions<T = Record<string, unknown>>({
	instanceClient,
	databaseName,
	tableName,
	conditions,
	sort,
	pageIndex,
	pageSize,
	onlyIfCached,
	getAttributes,
	headers,
}: Omit<GetSearchByConditionsParams, 'enabled'>) {
	return instanceClient.post<T[]>(
		'/',
		{
			operation: 'search_by_conditions',
			get_attributes: getAttributes ?? ['*'],
			database: databaseName,
			table: tableName,
			conditions: conditions!,
			sort: sort.attribute.length ? sort : undefined,
			offset: pageIndex * pageSize,
			limit: pageSize,
			onlyIfCached: onlyIfCached,
			noCacheStore: onlyIfCached,
		} satisfies SearchByConditionsRequest,
		{ timeout: 0, headers },
	);
}

export function translateColumnFilterToSearchConditions(
	key: string,
	rawValues: string,
	attribute: InstanceAttribute | undefined,
	relationshipInfo?: RelationshipAttributeInfo,
): SearchCondition[] {
	const split = rawValues.split(/ & /);
	return split.map(rawValue => translateColumnFilterToSearchCondition(key, rawValue, attribute, relationshipInfo));
}

export function translateColumnFilterToSearchCondition(
	key: string,
	rawValue: string,
	attribute: InstanceAttribute | undefined,
	relationshipInfo?: RelationshipAttributeInfo,
): SearchCondition {
	if (rawValue.startsWith(key)) {
		rawValue = rawValue.substring(key.length);
	}
	if (relationshipInfo) {
		return translateRelationshipColumnFilter(key, rawValue, relationshipInfo);
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
				search_value: translateKnownBooleanTypedValue(value),
			};
		}
		case 'Blob':
		case 'Bytes':
			return {
				search_attribute: key,
				search_type: comparator,
				search_value: value,
			};
		case 'Any':
		default:
			return {
				search_attribute: key,
				search_type: comparator,
				search_value: autoCast(value),
			};
	}
}

/**
 * A relationship column filters on a sub-property of the related table — `.name Anvil`,
 * `.rating >=4` — which the server runs as a join (`search_attribute: [column, subProperty]`).
 * Filtering the relationship itself has no meaning to the server, so a missing `.subProperty`
 * prefix is an error rather than a silently empty result.
 */
function translateRelationshipColumnFilter(
	key: string,
	rawValue: string,
	relationshipInfo: RelationshipAttributeInfo,
): SearchCondition {
	const match = rawValue.match(/^\s*\.([^.\s]+)\s*(.*)$/);
	if (!match) {
		throw new Error(
			`Filter ${key} on a property of ${relationshipInfo.relatedTableName}, e.g. ".${relationshipInfo.relatedPrimaryKey} value".`,
		);
	}
	const [, subProperty, rest] = match;
	const subAttribute = relationshipInfo.relatedAttributes.find((related) => related.attribute === subProperty);
	const condition = translateColumnFilterToSearchCondition(subProperty, rest, subAttribute);
	if (subProperty === relationshipInfo.relatedPrimaryKey && relationshipInfo.foreignKeyAttribute) {
		// The stored foreign key holds exactly the related primary key: query it directly (uses
		// its index, and works on servers whose operations API can't execute relationship joins).
		return {
			...condition,
			search_attribute: relationshipInfo.foreignKeyAttribute,
		};
	}
	return {
		...condition,
		search_attribute: [key, subProperty],
	};
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

export function parseComparator(value: string): { comparator: Comparator; value: string } {
	const lowered = value.toLowerCase();

	// Three accepted prefix shapes:
	//   - symbol-led (>, <, >=, =gt, etc.): no separator needed before the value
	//   - letters-then-symbol (gte=, lt=, etc.): the symbol acts as the separator
	//   - letters-only (lt, gt, greaterthan, etc.): a space or underscore separator is required,
	//     otherwise `LT1` would be ambiguous with values like "LT1" that just happen to start with letters
	const numericalComparator = lowered.match(
		/^ *([>=<]+[a-z]*[_ ]*|[a-z]+[>=<]+[_ ]*|[a-z]+[_ ]+)([\d._:tz-]+) *$/,
	);
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
