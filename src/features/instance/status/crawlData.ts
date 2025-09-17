import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { humanFileSize } from '@/lib/humanFileSize';
import { translateSecondsToAgo } from '@/lib/translateSecondsToAgo';

const startOf2025 = new Date(2025, 0).getTime();
const oneDayInMs = 24 * 60 * 60 * 1000;

interface TitleItem {
	title: string;
	depth: number;
}

interface NameValuePairItem {
	name: string;
	value: string;
	depth: number;
}

type ItemForDisplay = TitleItem | NameValuePairItem;

export function crawlData(data: Record<string, unknown>): ItemForDisplay[] {
	const sections: ItemForDisplay[] = [];
	for (const key in data) {
		const value = data[key];
		sections.push(...parseValue(key, value, 0));
	}
	return sections;
}

export function hasTitle(item: ItemForDisplay): item is TitleItem {
	return !!(item as TitleItem).title;
}

function parseValue(name: string, value: unknown, depth: number, parentName?: string): ItemForDisplay[] {
	if (value && Array.isArray(value)) {
		const array = value;
		return [
			array.length > 1 && {title: name, depth},
			...value.map((item, index) =>
				parseValue(
					array.length > 1 ? String(index + 1) : name,
					item,
					depth + 1,
					name,
				)).flat(1),
		].filter(excludeFalsy);
	}
	if (isObject(value)) {
		const obj = value;
		return [
			{ title: name, depth },
			...Object.keys(value).map(subKey => parseValue(
				String(subKey),
				obj[subKey],
				depth + 1,
				name,
			)).flat(1),
		];
	}
	if (name === '__updatedtime__' || name === '__createdtime__') {
		name = name.replace(/_/g, '').replace('time', '');
	}
	if (typeof value === 'number') {
		if (value > startOf2025 && value < Date.now() + oneDayInMs) {
			const elapsed = Date.now() - value;
			value = translateSecondsToAgo(elapsed, value);
		} else if (parentName === 'memory') {
			value = humanFileSize(value);
		} else if (!name.startsWith('raw') && name.toLowerCase().includes('load')) {
			value = Math.round(value * 10) / 10 + '%';
		}
	} else if (typeof value === 'boolean') {
		value = value ? 'Yes' : 'No';
	}
	return [
		{ name, value: String(value), depth },
	];
}

function isObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object';
}
