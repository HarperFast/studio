import { currentUrlAfterHash } from '@/lib/urls/currentUrlAfterHash';

export function currentUrlIncludingHash(): string {
	return '/#' + currentUrlAfterHash();
}
