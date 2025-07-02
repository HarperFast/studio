import React, { useState, useEffect } from 'react';
import { Col } from 'reactstrap';
import { ErrorBoundary } from 'react-error-boundary';

import CardFront from './CardFront';
import CardBack from './CardBack';
import ErrorFallbackCard from '../../shared/ErrorFallbackCard';
import addError from '../../../functions/api/lms/addError';

function OrgCard({ flippedCard, setFlippedCard, customer_id, ...rest }) {
	const [flipState, setFlipState] = useState(false);

	useEffect(() => {
		if (flippedCard !== customer_id) {
			setFlipState(false);
		}
		// eslint-disable-next-line
	}, [flippedCard]);

	useEffect(() => {
		if (flipState) {
			setFlippedCard(customer_id);
		}
		// eslint-disable-next-line
	}, [flipState]);

	return (
		<Col xs="12" md="6" lg="4" xl="3" className="mb-4">
			<ErrorBoundary
				onError={(error, componentStack) =>
					addError({ error: { message: error.message, componentStack }, customer_id })
				}
				FallbackComponent={ErrorFallbackCard}
			>
				{!flipState ? (
					<CardFront setFlipState={setFlipState} flipState={flipState} customer_id={customer_id} {...rest} />
				) : (
					<CardBack setFlipState={setFlipState} flipState={flipState} customer_id={customer_id} {...rest} />
				)}
			</ErrorBoundary>
		</Col>
	);
}

export default OrgCard;
