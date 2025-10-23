import { joinPath } from '@/lib/string/paths/joinPath';
import { removeFileNameFromPath } from '@/lib/string/paths/removeFileNameFromPath';

export function renameFileInPath(path: string, newFileName: string): string {
	return joinPath(removeFileNameFromPath(path), newFileName);
}
