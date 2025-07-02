import React, { useEffect, useState } from 'react';
import cn from 'classnames';
import { Input } from 'reactstrap';

function isValidUrl(url) {
	try {
		return Boolean(new URL(url));
		// eslint-disable-next-line
	} catch (e) {
		return false;
	}
}

function isValidTarballUrl(url) {
	// npm restrictions on the tarball url install here: https://docs.npmjs.com/cli/v9/commands/npm-install
	// updated to indexOf to allow signed URLs (with tokens appended)
	return isValidUrl(url) && (url.indexOf('.tar') !== -1 || url.indexOf('.tar.gz') !== -1 || url.indexOf('.tgz') !== -1);
}

export default function UrlInstallField({ pkg, setPackageSpec }) {
	const [packageUrl, setPackageUrl] = useState(pkg?.url || '');
	const [isValidPackageUrl, setIsValidPackageUrl] = useState(isValidTarballUrl(pkg?.url));

	useEffect(() => {
		setPackageSpec(isValidPackageUrl ? packageUrl : '');
	}, [packageUrl, isValidPackageUrl, setPackageSpec]);

	return (
		<Input
			type="text"
			id="tarball-url"
			title="URL to gzipped tarball"
			className={cn('package-url-input mt-2', {
				invalid: !isValidPackageUrl,
			})}
			value={packageUrl}
			onChange={(e) => {
				setIsValidPackageUrl(e.target.value.length === 0 || isValidTarballUrl(e.target.value));
				setPackageUrl(e.target.value);
			}}
			placeholder="URL to gzipped tarball"
		/>
	);
}
