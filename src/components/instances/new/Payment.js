import React, { useState } from 'react';
import { CardNumberElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Button, Card, CardBody, Col, Row } from 'reactstrap';
import useAsyncEffect from 'use-async-effect';
import { useStoreState } from 'pullstate';
import { useParams, useNavigate } from 'react-router-dom';

import appState from '../../../functions/state/appState';
import useNewInstance from '../../../functions/state/newInstance';

import addPaymentMethod from '../../../functions/api/lms/addPaymentMethod';
import getCustomer from '../../../functions/api/lms/getCustomer';
import CreditCardForm from '../../shared/CreditCardForm';
import FormStatus from '../../shared/FormStatus';
import ContentContainer from '../../shared/ContentContainer';

function Payment() {
	const navigate = useNavigate();
	const { customer_id } = useParams();
	const auth = useStoreState(appState, (s) => s.auth);
	const hasCard = useStoreState(appState, (s) => s.hasCard);
	const stripeId = useStoreState(appState, (s) => s.customer?.stripe_id);
	const stripeCoupons = useStoreState(appState, (s) => s.customer?.stripe_coupons);
	const usedFreetrial = stripeCoupons.find((c) => c.name === 'FREETRIAL');
	const products = useStoreState(appState, (s) => s.products);
	const [newInstance] = useNewInstance({});
	const [formData, setFormData] = useState({ postal_code: false, card: false, expire: false, cvc: false });
	const [formState, setFormState] = useState({});
	const stripe = useStripe();
	const elements = useElements();
	const isLocal = newInstance.is_local;
	const isWavelength = newInstance.is_wavelength;
	const computeProduct = products[
		isLocal ? 'local_compute' : isWavelength ? 'wavelength_compute' : 'cloud_compute'
	].find((p) => p.value.stripe_plan_id === newInstance.stripe_plan_id);
	const storageProduct = isLocal
		? { price: 0 }
		: products.cloud_storage.find((p) => p.value.data_volume_size === newInstance.data_volume_size);

	useAsyncEffect(async () => {
		const { submitted, processing } = formState;
		if (submitted && !processing) {
			const { card, expire, cvc, postal_code, line1, line2, state, city, country } = formData;
			if (!card || !expire || !cvc || !postal_code || !line1 || !state || !city || !country) {
				setFormState({ error: 'All fields are required' });
				setTimeout(() => setFormState({}), 2000);
			} else {
				const { error, paymentMethod } = await stripe.createPaymentMethod({
					type: 'card',
					card: elements.getElement(CardNumberElement),
					billing_details: { address: { postal_code, line1, line2, state, city, country } },
				});

				setFormState({ processing: true });

				if (error) {
					setFormState({ error: error.message });
					setTimeout(() => setFormState({}), 2000);
				} else {
					await addPaymentMethod({ auth, payment_method_id: paymentMethod.id, stripe_id: stripeId, customer_id });
					if (window._kmq) window._kmq.push(['record', 'added credit card - new instance']);
					await getCustomer({ auth, customer_id });
					setFormState({ success: true });
				}
			}
		}
	}, [formState]);

	return formState.processing ? (
		<FormStatus
			height="650px"
			status="processing"
			header="Adding Card To Your Account"
			subhead="The Credit Schnauzer is securely contacting Stripe."
		/>
	) : formState.error ? (
		<FormStatus height="650px" status="error" header={formState.error} subhead="Please try again" />
	) : formState.success || hasCard ? (
		<>
			<FormStatus
				height="650px"
				status="success"
				header="Success!"
				subhead="Credit Card was successfully added to your account."
			/>
			<Row>
				<Col sm="6">
					<Button
						id="instanceDetailsButton"
						onClick={() => navigate(`/o/${customer_id}/instances/new/details_${isLocal ? 'local' : 'cloud'}`)}
						title="Back to Instance Details"
						block
						color="purple"
						className="mt-3"
					>
						<i className="fa fa-chevron-circle-left me-2" />
						Instance Details
					</Button>
				</Col>
				<Col sm="6">
					<Button
						id="reviewInstanceDetails"
						title="Review Instance Details"
						onClick={() => navigate(`/o/${customer_id}/instances/new/confirm`)}
						block
						color="purple"
						className="mt-3"
					>
						Review Instance Details
						<i className="fa fa-chevron-circle-right ms-2" />
					</Button>
				</Col>
			</Row>
		</>
	) : (
		<>
			<Card id="paymentDetails">
				<CardBody>
					<div className="mb-4">
						{computeProduct?.value?.compute_price ? (
							<div className="mb-2">
								The selected <b>instance type</b> has a cost of{' '}
								<b>{computeProduct?.value?.compute_price_string_with_interval}</b>.
							</div>
						) : null}
						{storageProduct?.value?.storage_price ? (
							<div className="mb-2">
								The selected <b>storage size</b> has a cost of{' '}
								<b>{storageProduct?.value?.storage_price_string_with_interval}</b>.
							</div>
						) : null}
						{!usedFreetrial && (
							<div className="mb-2">
								This organization is entitled to a credit equal to 1 month of 1GB RAM/1GB Disk (a $33 value) with coupon
								code <b className="text-success">FREETRIAL</b>. Enter the code into the form on the next page to receive
								the credit.
							</div>
						)}
						Please add a credit card to your account using the form below. If you have a coupon code, your card will not
						be charged until your credits run out.
					</div>
					<ContentContainer header="Credit Card Details">
						<CreditCardForm setFormData={setFormData} formData={formData} setFormState={setFormState} />
					</ContentContainer>
				</CardBody>
			</Card>
			<Row>
				<Col sm="6">
					<Button
						id="instanceDetailsButton"
						onClick={() => navigate(`/o/${customer_id}/instances/new/details_${isLocal ? 'local' : 'cloud'}`)}
						title="Back to Instance Details"
						block
						className="mt-3"
						color="purple"
					>
						<i className="fa fa-chevron-circle-left me-2" />
						Instance Details
					</Button>
				</Col>
				<Col sm="6">
					<Button
						id="addCardToAccount"
						title="Add Card To Account"
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
						color="purple"
					>
						Add Card To Account
						<i className="fa fa-chevron-circle-right ms-2" />
					</Button>
				</Col>
			</Row>
		</>
	);
}

export default Payment;
