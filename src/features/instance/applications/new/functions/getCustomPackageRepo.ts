import isValidUrl from '@/shared/functions/isValidUrl';

function isValidTarballUrl(url: string) {
	// npm restrictions on the tarball url install here: https://docs.npmjs.com/cli/v9/commands/npm-install
	// updated to indexOf to allow signed URLs (with tokens appended)
	return isValidUrl(url) && (url.indexOf('.tar') !== -1 || url.indexOf('.tar.gz') !== -1 || url.indexOf('.tgz') !== -1);
}

// function getCustomApplicationRepo() {}

export { isValidTarballUrl };
