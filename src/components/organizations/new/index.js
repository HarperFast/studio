import React, { useEffect } from 'react';
import Loader from '../../shared/Loader';

function NewOrgIndex() {
	useEffect(() => {
		window.location.replace('https://fabric.harper.fast/#/new-org');
	}, []);

	return <Loader spinner relative />;
}

export default NewOrgIndex;
