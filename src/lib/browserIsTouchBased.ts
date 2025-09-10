export function browserIsTouchBased(): boolean {
	return 'ontouchstart' in window || navigator['maxTouchPoints'] > 0;
}
