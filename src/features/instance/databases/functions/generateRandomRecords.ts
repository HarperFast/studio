import { isSyntheticAttribute } from '@/features/instance/databases/functions/relationshipAttributes';
import { InstanceAttribute, InstanceDatabaseTableMap } from '@/integrations/api/api.patch';

const FIRST_NAMES = [
	'Ada',
	'Alan',
	'Grace',
	'Linus',
	'Margaret',
	'Dennis',
	'Barbara',
	'Ken',
	'Radia',
	'Donald',
	'Katherine',
	'Edsger',
	'Frances',
	'John',
	'Hedy',
];
const LAST_NAMES = [
	'Lovelace',
	'Turing',
	'Hopper',
	'Hamilton',
	'Ritchie',
	'Liskov',
	'Thompson',
	'Perlman',
	'Knuth',
	'Johnson',
	'Dijkstra',
	'Allen',
	'Backus',
	'Lamarr',
	'Shannon',
];
const WORDS = [
	'amber',
	'birch',
	'cedar',
	'delta',
	'ember',
	'fjord',
	'grove',
	'harbor',
	'indigo',
	'juniper',
	'krypton',
	'lagoon',
	'meadow',
	'nimbus',
	'onyx',
	'prairie',
	'quartz',
	'ridge',
	'summit',
	'tundra',
];
const CITIES = ['Denver', 'Austin', 'Seattle', 'Boston', 'Chicago', 'Portland', 'Nashville', 'Phoenix', 'Atlanta'];
const COUNTRIES = ['USA', 'Canada', 'Germany', 'Japan', 'Brazil', 'Australia', 'France', 'India', 'Spain'];

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
const randomInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const capitalize = (word: string) => word[0].toUpperCase() + word.slice(1);
const recentISODate = () => new Date(Date.now() - randomInt(0, 365) * 24 * 60 * 60 * 1000).toISOString();

/** Heuristic value for columns without a declared type, keyed off common column names. */
function randomValueByName(attribute: string): unknown {
	const name = attribute.toLowerCase();
	if (/email/.test(name)) {
		return `${pick(FIRST_NAMES).toLowerCase()}.${pick(LAST_NAMES).toLowerCase()}@example.com`;
	}
	if (/phone/.test(name)) {
		return `555-${randomInt(100, 999)}-${randomInt(1000, 9999)}`;
	}
	if (/(^|_)(url|link|website)($|_)/.test(name)) {
		return `https://example.com/${pick(WORDS)}`;
	}
	if (/name/.test(name)) {
		return /(first|given)/.test(name)
			? pick(FIRST_NAMES)
			: /(last|family|sur)/.test(name)
			? pick(LAST_NAMES)
			: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
	}
	if (/age/.test(name)) {
		return randomInt(1, 90);
	}
	if (/year/.test(name)) {
		return randomInt(1970, 2026);
	}
	if (/(price|cost|amount|total|salary)/.test(name)) {
		return Number((Math.random() * 500).toFixed(2));
	}
	if (/(count|qty|quantity|weight|height|size|pages|score|rating|number|num_)/.test(name)) {
		return randomInt(0, 500);
	}
	if (/(^is_|^has_|enabled|active|flag|adorable|verified)/.test(name)) {
		return Math.random() < 0.5;
	}
	if (/(date|time|_at$|created|updated)/.test(name)) {
		return recentISODate();
	}
	if (/city/.test(name)) {
		return pick(CITIES);
	}
	if (/country/.test(name)) {
		return pick(COUNTRIES);
	}
	if (/(description|notes|comment|bio|summary)/.test(name)) {
		return `A ${pick(WORDS)} ${pick(WORDS)} with a hint of ${pick(WORDS)}.`;
	}
	return `${capitalize(pick(WORDS))} ${capitalize(pick(WORDS))}`;
}

function randomValue(attribute: InstanceAttribute): unknown {
	switch (attribute.type) {
		case 'ID':
			return crypto.randomUUID();
		case 'Int':
		case 'Long':
		case 'BigInt': {
			const byName = randomValueByName(attribute.attribute);
			return typeof byName === 'number' ? Math.round(byName) : randomInt(0, 1000);
		}
		case 'Float': {
			const byName = randomValueByName(attribute.attribute);
			return typeof byName === 'number' ? byName : Number((Math.random() * 1000).toFixed(2));
		}
		case 'Boolean':
			return Math.random() < 0.5;
		case 'Date':
			return recentISODate();
		case 'String': {
			const byName = randomValueByName(attribute.attribute);
			return typeof byName === 'string' ? byName : String(byName);
		}
		default:
			// No declared type (schemaless table) or 'Any': go by the column name alone.
			return randomValueByName(attribute.attribute);
	}
}

/** Attributes that random rows should fill: everything except the primary key (Harper
 * auto-assigns it on insert), system timestamps, binary columns, and relationship/computed
 * attributes (the server rejects records that assign those). */
export function randomizableAttributes(
	attributes: InstanceAttribute[] | undefined,
	databaseTables?: InstanceDatabaseTableMap,
): InstanceAttribute[] {
	return (attributes ?? []).filter((attr) =>
		!attr.is_primary_key
		&& attr.attribute !== '__createdtime__'
		&& attr.attribute !== '__updatedtime__'
		&& attr.type !== 'Bytes'
		&& attr.type !== 'Blob'
		&& !isSyntheticAttribute(attr, databaseTables)
	);
}

export function generateRandomRecords(attributes: InstanceAttribute[], count: number): Record<string, unknown>[] {
	const fillable = randomizableAttributes(attributes);
	return Array.from({ length: count }, () => {
		const record: Record<string, unknown> = {};
		for (const attribute of fillable) {
			record[attribute.attribute] = randomValue(attribute);
		}
		return record;
	});
}
