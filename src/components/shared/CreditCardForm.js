import React, { useState } from 'react';
import { Col, Input, Row } from 'reactstrap';
import { CardCvcElement, CardExpiryElement, CardNumberElement } from '@stripe/react-stripe-js';
import { CountryDropdown, RegionDropdown } from 'react-country-region-selector';
import { useStoreState } from 'pullstate';
import { useParams } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';

import cardOptions from '../../functions/stripe/cardOptions';
import appState from '../../functions/state/appState';
import ErrorFallback from './ErrorFallback';
import addError from '../../functions/api/lms/addError';

function CreditCardForm({ setFormData, formData }) {
	const { customer_id } = useParams();
	const [formState, setFormState] = useState({});
	const theme = useStoreState(appState, (s) => s.theme);
	const themedCardOptions = cardOptions({ theme });

	return (
		<ErrorBoundary
			onError={(error, componentStack) => addError({ error: { message: error.message, componentStack }, customer_id })}
			FallbackComponent={ErrorFallback}
		>
			<Row>
				<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
					card number
				</Col>
				<Col md="6" xs="12" className="text-md-end text-center">
					<div className={`fake-input ${formState.cardError ? 'error' : ''}`}>
						<CardNumberElement
							options={themedCardOptions}
							id="ccCardNumber"
							onChange={(e) => {
								setFormState({ ...formState, cardError: e.error?.message });
								setFormData({
									...formData,
									card: e.complete,
								});
							}}
						/>
					</div>
				</Col>
				<Col xs="12">
					<hr className="my-2" />
				</Col>
				<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
					expiration
				</Col>
				<Col md="6" xs="12" className="text-md-end text-center">
					<div className={`fake-input ${formState.expError ? 'error' : ''}`}>
						<CardExpiryElement
							options={themedCardOptions}
							id="ccExpire"
							onChange={(e) => {
								setFormState({ ...formState, expError: e.error?.message });
								setFormData({
									...formData,
									expire: e.complete,
								});
							}}
						/>
					</div>
				</Col>
				<Col xs="12">
					<hr className="my-2" />
				</Col>
				<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
					cvcc
				</Col>
				<Col md="6" xs="12" className="text-md-end text-center">
					<div className={`fake-input ${formState.cvcError ? 'error' : ''}`}>
						<CardCvcElement
							id="ccCVC"
							options={themedCardOptions}
							onChange={(e) => {
								setFormState({ ...formState, cvcError: e.error?.message });
								setFormData({
									...formData,
									cvc: e.complete,
								});
							}}
						/>
					</div>
				</Col>
				<Col xs="12">
					<hr className="my-2" />
				</Col>
				<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
					country
				</Col>
				<Col md="6" xs="12" className="text-md-end text-center">
					<CountryDropdown
						id="ccCountry"
						valueType="short"
						value={formData.country}
						priorityOptions={['CA', 'US', 'GB']}
						defaultOptionLabel="select your country"
						onChange={(val) =>
							setFormData({
								...formData,
								country: val,
							})
						}
					/>
				</Col>
				<Col xs="12">
					<hr className="my-2" />
				</Col>
				<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
					state/province
				</Col>
				<Col md="6" xs="12" className="text-md-end text-center">
					<RegionDropdown
						id="ccRegion"
						blankOptionLabel="select country first"
						defaultOptionLabel="select state / province"
						valueType="short"
						countryValueType="short"
						country={formData.country}
						value={formData.state}
						onChange={(val) =>
							setFormData({
								...formData,
								state: val,
							})
						}
					/>
				</Col>
				<Col xs="12">
					<hr className="my-2" />
				</Col>
				<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
					address
				</Col>
				<Col md="6" xs="12" className="text-md-end text-center">
					<Input
						id="ccLine1"
						onChange={(e) =>
							setFormData({
								...formData,
								line1: e.target.value,
							})
						}
					/>
				</Col>
				<Col xs="12">
					<hr className="my-2" />
				</Col>
				<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
					apt/unit
				</Col>
				<Col md="6" xs="12" className="text-md-end text-center">
					<Input
						id="ccApt"
						onChange={(e) =>
							setFormData({
								...formData,
								line2: e.target.value,
							})
						}
					/>
				</Col>
				<Col xs="12">
					<hr className="my-2" />
				</Col>
				<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
					city
				</Col>
				<Col md="6" xs="12" className="text-md-end text-center">
					<Input
						id="ccCity"
						onChange={(e) =>
							setFormData({
								...formData,
								city: e.target.value,
							})
						}
					/>
				</Col>
				<Col xs="12">
					<hr className="my-2" />
				</Col>
				<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
					billing postal code
				</Col>
				<Col md="6" xs="12" className="text-md-end text-center">
					<Input
						id="ccPostalCode"
						onChange={(e) =>
							setFormData({
								...formData,
								postal_code: e.target.value,
							})
						}
					/>
				</Col>
			</Row>
		</ErrorBoundary>
	);
}

export default CreditCardForm;
