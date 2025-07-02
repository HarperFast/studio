import React, { useState } from 'react';
import { Button, Row, Col, Card, CardBody } from 'reactstrap';
import { CardNumberElement, useElements, useStripe } from '@stripe/react-stripe-js';
import useAsyncEffect from 'use-async-effect';
import { useStoreState } from 'pullstate';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import queryString from 'query-string';
import { ErrorBoundary } from 'react-error-boundary';

import appState from '../../../functions/state/appState';

import addPaymentMethod from '../../../functions/api/lms/addPaymentMethod';
import getCustomer from '../../../functions/api/lms/getCustomer';

import CreditCardForm from '../../shared/CreditCardForm';
import FormStatus from '../../shared/FormStatus';
import ErrorFallback from '../../shared/ErrorFallback';
import addError from '../../../functions/api/lms/addError';
import BadCard from '../../shared/BadCard';

function CardEdit({ setEditingCard, customerCard, formStateHeight, badCard }) {
	const { customer_id } = useParams();
	const auth = useStoreState(appState, (s) => s.auth);
	const stripe_id = useStoreState(appState, (s) => s.customer?.stripe_id);
	const [formData, setFormData] = useState({ postal_code: false, card: false, expire: false, cvc: false });
	const [formState, setFormState] = useState({});
	const stripe = useStripe();
	const elements = useElements();
	const navigate = useNavigate();
	const { search } = useLocation();
	const { returnURL } = queryString.parse(search);

	useAsyncEffect(async () => {
		const { submitted, processing } = formState;
		if (submitted && !processing) {
			const { card, expire, cvc, postal_code, line1, line2, state, city, country } = formData;
			if (!card || !expire || !cvc || !postal_code || !line1 || !state || !city || !country) {
				setFormState({ error: 'All fields are required' });
			} else {
				const payload = await stripe.createPaymentMethod({
					type: 'card',
					card: elements.getElement(CardNumberElement),
					billing_details: { address: { postal_code, line1, line2, state, city, country } },
				});
				setFormState({ processing: true });

				if (payload.error) {
					setFormState({ ...formState, error: payload.error.message });
					setTimeout(() => setFormState({ ...formState, error: false }), 2000);
				} else {
					const response = await addPaymentMethod({
						auth,
						payment_method_id: payload.paymentMethod.id,
						stripe_id,
						customer_id,
					});

					if (response.error) {
						setFormState({ ...formState, error: response.message });
						setTimeout(() => setFormState({ ...formState, error: false }), 2000);
					} else {
						if (window._kmq) window._kmq.push(['record', 'added credit card - billing page']);
						setFormState({ success: response.message });
						await getCustomer({ auth, customer_id });

						if (returnURL) {
							navigate(returnURL);
						} else {
							setEditingCard(false);
						}
					}
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
					header="Adding Card To Your Account"
					subhead="The Credit Schnauzer is securely contacting Stripe."
				/>
			) : formState.success ? (
				<FormStatus
					height={formStateHeight}
					status="success"
					header="Success!"
					subhead="Credit Card was successfully added to your account."
				/>
			) : formState.error ? (
				<FormStatus height={formStateHeight} status="error" header={formState.error} subhead="Please try again" />
			) : (
				<Card>
					<CardBody>
						{badCard && <BadCard />}
						<CreditCardForm setFormData={setFormData} formData={formData} />
						<hr className="my-2" />
						<Row>
							{customerCard && (
								<Col sm="6">
									<Button id="editCard" onClick={() => setEditingCard(false)} block color="danger" className="mt-3">
										Cancel
									</Button>
								</Col>
							)}
							<Col>
								<Button
									id={customerCard ? 'saveNewCard' : 'addCardToAccount'}
									title={customerCard ? 'Save New Card' : 'Add Card To Account'}
									disabled={
										formState.submitted ||
										!formData.card ||
										!formData.expire ||
										!formData.cvc ||
										!formData.postal_code ||
										!stripe ||
										!elements
									}
									onClick={() => setFormState({ submitted: true })}
									block
									className="mt-3"
									color="success"
								>
									{customerCard ? 'Save New Card' : 'Add Card To Account'}
								</Button>
							</Col>
						</Row>
					</CardBody>
				</Card>
			)}
		</ErrorBoundary>
	);
}

export default CardEdit;
