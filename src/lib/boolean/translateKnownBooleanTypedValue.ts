const acceptedTrueValues = [
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

export function translateKnownBooleanTypedValue(value: string): boolean {
	const lowerValue = value.toLowerCase().trim();
	return acceptedTrueValues.includes(lowerValue);
}
