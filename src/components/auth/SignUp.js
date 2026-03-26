import React, { useEffect } from 'react';
import Loader from '../shared/Loader';

function SignUp() {
	useEffect(() => {
		window.location.replace('https://fabric.harper.fast/#/sign-up');
	}, []);

	return <Loader spinner relative />;
}

export default SignUp;
