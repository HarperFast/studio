import React, { useState } from 'react';
import useAsyncEffect from 'use-async-effect';
import { Row, Col, Button, CardBody, Card } from 'reactstrap';
import { useStoreState } from 'pullstate';
import { useParams } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';

import appState from '../../../functions/state/appState';

import removePaymentMethod from '../../../functions/api/lms/removePaymentMethod';
import FormStatus from '../../shared/FormStatus';
import BadCard from '../../shared/BadCard';
import getCustomer from '../../../functions/api/lms/getCustomer';
import ErrorFallback from '../../shared/ErrorFallback';
import addError from '../../../functions/api/lms/addError';

function CardStatic({ setEditingCard, customerCard, formStateHeight, badCard }) {
	const { customer_id } = useParams();
	const auth = useStoreState(appState, (s) => s.auth);
	const instances = useStoreState(appState, (s) => s.instances);
	const stripeId = useStoreState(appState, (s) => s.customer?.stripe_id);
	const [formState, setFormState] = useState({});

	useAsyncEffect(async () => {
		const { submitted } = formState;
		if (submitted) {
			const hasPaidInstance = instances.find((i) => i.totalPrice);
			if (hasPaidInstance) {
				setFormState({ error: 'You have active, non-free instances.' });
				setTimeout(() => setFormState({}), 2000);
			} else {
				setFormState({ processing: true });

				const response = await removePaymentMethod({
					auth,
					stripe_id: stripeId,
					payment_method_id: customerCard.id,
					customer_id,
				});
				if (response.error) {
					setFormState({ error: response.message });
					setTimeout(() => setFormState({}), 2000);
				} else {
					setFormState({ success: true });
					await getCustomer({ auth, customer_id });
					setFormState({});
					setTimeout(() => setEditingCard(false), 0);
				}
			}
		}
	}, [formState]);

	return (
		<ErrorBoundary
			onError={(error, componentStack) => addError({ error: { message: error.message, componentStack }, customer_id })}
			FallbackComponent={ErrorFallback}
		>
			{formState.processing ? (
				<FormStatus
					height={formStateHeight}
					status="processing"
					header="Removing Card From Account"
					subhead="The Credit Schnauzer is securely contacting Stripe."
				/>
			) : formState.success ? (
				<FormStatus
					height={formStateHeight}
					status="success"
					header="Card Removed Successfully"
					subhead="Your account is now limited to free products."
				/>
			) : formState.error ? (
				<FormStatus
					height={formStateHeight}
					status="error"
					header={formState.error}
					subhead="You must remove them to remove your card."
				/>
			) : (
				<Card>
					<CardBody>
						{badCard && <BadCard />}
						<Row>
							<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
								card number
							</Col>
							<Col md="6" xs="12">
								<div className="input-static">
									**** **** ****
									{customerCard?.card?.last4}
								</div>
							</Col>
							<Col xs="12">
								<hr className="my-2" />
							</Col>
							<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
								expiration
							</Col>
							<Col md="6" xs="12">
								<div className="input-static">{`${customerCard?.card?.exp_month} / ${customerCard?.card?.exp_year}`}</div>
							</Col>
							<Col xs="12">
								<hr className="my-2" />
							</Col>
							<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
								cvcc
							</Col>
							<Col md="6" xs="12">
								<div className="input-static">***</div>
							</Col>
							<Col xs="12">
								<hr className="my-2" />
							</Col>
							<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
								country
							</Col>
							<Col md="6" xs="12">
								<div className="input-static">{customerCard?.billing_details?.address?.country}</div>
							</Col>
							<Col xs="12">
								<hr className="my-2" />
							</Col>
							<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
								state/province
							</Col>
							<Col md="6" xs="12">
								<div className="input-static">{customerCard?.billing_details?.address?.state}</div>
							</Col>
							<Col xs="12">
								<hr className="my-2" />
							</Col>
							<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
								address
							</Col>
							<Col md="6" xs="12">
								<div className="input-static">{customerCard?.billing_details?.address?.line1}</div>
							</Col>
							<Col xs="12">
								<hr className="my-2" />
							</Col>
							<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
								apt/unit
							</Col>
							<Col md="6" xs="12">
								<div className="input-static">{customerCard?.billing_details?.address?.line2}</div>
							</Col>
							<Col xs="12">
								<hr className="my-2" />
							</Col>
							<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
								city
							</Col>
							<Col md="6" xs="12">
								<div className="input-static">{customerCard?.billing_details?.address?.city}</div>
							</Col>
							<Col xs="12">
								<hr className="my-2" />
							</Col>
							<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
								billing postal code
							</Col>
							<Col md="6" xs="12">
								<div className="input-static">{customerCard?.billing_details?.address?.postal_code}</div>
							</Col>
						</Row>
						<hr className="my-2" />
						<Row>
							<Col sm="6">
								<Button
									id="removeCard"
									title="Remove Card"
									disabled={formState.submitted}
									onClick={() => setFormState({ submitted: true })}
									block
									className="mt-3"
									color="danger"
								>
									Remove Card
								</Button>
							</Col>
							<Col sm="6">
								<Button id="updateCard" block color="success" className="mt-3" onClick={() => setEditingCard(true)}>
									Update Card
								</Button>
							</Col>
						</Row>
					</CardBody>
				</Card>
			)}
		</ErrorBoundary>
	);
}

export default CardStatic;
