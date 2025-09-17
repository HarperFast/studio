export function parseFileExtension(name: string): string | null {
	return name && [...name].includes('.') ? name.split('.').slice(-1)[0] : null;
}
