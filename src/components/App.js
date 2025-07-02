import React from 'react';

import { BrowserRouter } from 'react-router-dom';
import { Elements } from '@stripe/react-stripe-js';
import { positions, Provider } from 'react-alert';

import stripePromise from '../functions/stripe/stripePromise';
import AlertTemplate from './shared/Alert';
import App from './layouts/App';

function Template() {
	return (
		<Elements stripe={stripePromise}>
			<Provider template={AlertTemplate} timeout={4000} position={positions.TOP_CENTER}>
				<BrowserRouter>
					<App />
				</BrowserRouter>
			</Provider>
		</Elements>
	);
}

export default Template;
