import { currentUrlAfterHash } from '@/lib/urls/currentUrlAfterHash';

const ignoredUrls = [
	'/',
	'/forgot-password',
	'/reset-password',
	'/sign-in',
	'/sign-up',
	'/verify-email',
];

export function buildRedirectInSearch() {
	const url = currentUrlAfterHash().split('?')[0];
	return !ignoredUrls.includes(url) && { redirect: url };
}
