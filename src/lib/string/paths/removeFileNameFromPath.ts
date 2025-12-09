import { joinPath } from '@/lib/string/paths/joinPath';

export function removeFileNameFromPath(path: string): string {
	return joinPath(path.split('/').slice(0, -1));
}
