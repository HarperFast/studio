import { isValidUrl } from '@/lib/isValidUrl';

export function isValidTarballUrl(url: string) {
	// npm restrictions on the tarball url install here: https://docs.npmjs.com/cli/v9/commands/npm-install
	// updated to indexOf to allow signed URLs (with tokens appended)
	return isValidUrl(url) && (url.includes('.tar') || url.includes('.tar.gz') || url.includes('.tgz'));
}

// function getCustomApplicationRepo() {}
