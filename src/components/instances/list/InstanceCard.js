import React, { useState, useEffect } from 'react';
import { Col } from 'reactstrap';
import { ErrorBoundary } from 'react-error-boundary';

import CardFront from './CardFront';
import ErrorFallbackCard from '../../shared/ErrorFallbackCard';
import addError from '../../../functions/api/lms/addError';
import CardBackLogin from './CardBackLogin';
import CardBackDelete from './CardBackDelete';

function InstanceCard({ flippedCard, setFlippedCard, compute_stack_id, customer_id, ...rest }) {
	const [flipState, setFlipState] = useState(false);

	useEffect(() => {
		if (flippedCard !== compute_stack_id) {
			setFlipState(false);
		}
		// eslint-disable-next-line
	}, [flippedCard]);

	useEffect(() => {
		if (flipState) {
			setFlippedCard(compute_stack_id);
		}
		// eslint-disable-next-line
	}, [flipState]);

	return (
		<Col xs="12" md="6" lg="4" xl="3" className="mb-4 card-holder">
			<ErrorBoundary
				onError={(error, componentStack) =>
					addError({
						error: { message: error.message, componentStack },
						customer_id,
						compute_stack_id,
					})
				}
				FallbackComponent={ErrorFallbackCard}
			>
				{!flipState ? (
					<CardFront
						setFlipState={setFlipState}
						flipState={flipState}
						customer_id={customer_id}
						compute_stack_id={compute_stack_id}
						{...rest}
					/>
				) : flipState === 'login' ? (
					<CardBackLogin
						setFlipState={setFlipState}
						flipState={flipState}
						customer_id={customer_id}
						compute_stack_id={compute_stack_id}
						{...rest}
					/>
				) : (
					<CardBackDelete
						setFlipState={setFlipState}
						flipState={flipState}
						customer_id={customer_id}
						compute_stack_id={compute_stack_id}
						{...rest}
					/>
				)}
			</ErrorBoundary>
		</Col>
	);
}

export default InstanceCard;
