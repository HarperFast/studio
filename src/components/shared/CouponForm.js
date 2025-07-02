import React, { useState } from 'react';
import { Row, Col, Button, Input } from 'reactstrap';
import useAsyncEffect from 'use-async-effect';
import { useStoreState } from 'pullstate';
import { ErrorBoundary } from 'react-error-boundary';
import { useParams, useLocation } from 'react-router-dom';
import queryString from 'query-string';

import appState from '../../functions/state/appState';

import addCoupon from '../../functions/api/lms/addCoupon';
import getCustomer from '../../functions/api/lms/getCustomer';
import ErrorFallback from './ErrorFallback';
import addError from '../../functions/api/lms/addError';

let controller;

function CouponForm() {
	const { customer_id } = useParams();
	const { search } = useLocation();
	const { code } = queryString.parse(search);
	const auth = useStoreState(appState, (s) => s.auth);
	const [formData, setFormData] = useState({ coupon_code: code || '' });
	const [formState, setFormState] = useState({});
	const [mounted, setMounted] = useState(false);

	useAsyncEffect(
		async () => {
			if (formState.submitted) {
				const { coupon_code } = formData;
				if (!coupon_code) {
					setFormState({ error: 'Please enter a valid coupon code' });
				} else {
					controller = new AbortController();
					const response = await addCoupon({ auth, customer_id, coupon_code });

					if (response.result === false || response.error) {
						setFormState({ error: response.message });
					} else {
						if (window._kmq) window._kmq.push(['record', 'user added coupon']);
						await getCustomer({ auth, customer_id });
						if (mounted) {
							setFormData({ coupon_code: '' });
							setFormState({});
						}
					}
				}
			}
		},
		() => controller?.abort(),
		[formState]
	);

	useAsyncEffect(() => {
		if (!formState.submitted) setFormState({});
	}, [formData]);

	useAsyncEffect(
		() => {
			setMounted(true);
			if (formData.coupon_code) {
				setFormState({ submitted: true });
			}
		},
		() => setMounted(false),
		[]
	);

	return (
		<ErrorBoundary
			onError={(error, componentStack) => addError({ error: { message: error.message, componentStack }, customer_id })}
			FallbackComponent={ErrorFallback}
		>
			<Row>
				<Col md="6">
					<Input
						id="coupon_code"
						className="mb-2"
						type="text"
						value={formData.coupon_code}
						invalid={!!formState.error}
						disabled={formState.submitted}
						placeholder="coupon code"
						onChange={(e) => setFormData({ coupon_code: e.target.value.toUpperCase() })}
					/>
				</Col>
				<Col md="6">
					<Button
						id="addCoupon"
						color="success"
						disabled={formState.submitted}
						block
						onClick={() => setFormState({ submitted: true })}
					>
						{formState.submitted ? <i className="fa fa-spinner fa-spin text-white" /> : <span>Add Coupon</span>}
					</Button>
				</Col>
				<Col xs="12" className="text-center text-danger text-small">
					{formState.error}&nbsp;
				</Col>
			</Row>
		</ErrorBoundary>
	);
}

export default CouponForm;
