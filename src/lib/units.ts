export type Units = 'bytes' | 'secs';

const dataUnits = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
const timeUnits = ['secs', 'mins', 'hrs'];
const unitsMultipliers = {
	bytes: 1000,
	secs: 60,
};

export function scaleValueToUnits(value: number, baseUnits: string, units: string) {
	let availableUnits;
	let scaleBase;
	switch (baseUnits) {
		case 'bytes': {
			availableUnits = dataUnits;
			scaleBase = unitsMultipliers.bytes;
			break;
		}
		case 'secs': {
			availableUnits = timeUnits;
			scaleBase = unitsMultipliers.secs;
			break;
		}
		default:
			return value;
	}
	const scaleExponent = availableUnits.indexOf(units);
	if (scaleExponent === -1) {
		return value;
	}
	const scaleFactor = scaleBase ** scaleExponent;
	return value / scaleFactor;
}

export function determineUnits(baseUnits: string, value: number) {
	let availableUnits;
	let unitsMultiplier;
	switch (baseUnits) {
		case 'bytes':
			availableUnits = dataUnits;
			unitsMultiplier = unitsMultipliers.bytes;
			break;
		case 'secs':
			availableUnits = timeUnits;
			unitsMultiplier = unitsMultipliers.secs;
			break;
		default:
			return baseUnits;
	}
	let i = 0;
	while (value >= unitsMultiplier && i < availableUnits.length - 1) {
		value /= unitsMultiplier;
		i++;
	}
	return availableUnits[i];
}
