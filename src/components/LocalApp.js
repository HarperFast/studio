import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { positions, Provider } from 'react-alert';

import AlertTemplate from './shared/Alert';
import App from './layouts/LocalApp';

function Template() {
	return (
		<Provider template={AlertTemplate} timeout={4000} position={positions.TOP_CENTER}>
			<BrowserRouter>
				<App />
			</BrowserRouter>
		</Provider>
	);
}

export default Template;
