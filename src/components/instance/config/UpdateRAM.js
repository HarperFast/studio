import React, { useState } from 'react';
import { Button, Card, CardBody, Col, Row } from 'reactstrap';
import SelectDropdown from 'react-select';
import useAsyncEffect from 'use-async-effect';
import { useNavigate, useParams } from 'react-router-dom';
import { useStoreState } from 'pullstate';
import { useAlert } from 'react-alert';

import appState from '../../../functions/state/appState';
import instanceState from '../../../functions/state/instanceState';
import config from '../../../config';

import ChangeSummary from './ChangeSummary';
import BadCard from '../../shared/BadCard';
import updateInstance from '../../../functions/api/lms/updateInstance';
import commaNumbers from '../../../functions/util/commaNumbers';
import VisitCard from '../../shared/VisitCard';

function UpdateRAM({ setInstanceAction, showPrepaidCompute }) {
	const { customer_id, compute_stack_id } = useParams();
	const navigate = useNavigate();
	const alert = useAlert();
	const auth = useStoreState(appState, (s) => s.auth);
	const hasCard = useStoreState(appState, (s) => s.hasCard);
	const badCard = useStoreState(
		appState,
		(s) => s.customer?.current_payment_status?.status === 'invoice.payment_failed'
	);
	const compute = useStoreState(instanceState, (s) => s.compute);
	const storage = useStoreState(instanceState, (s) => s.storage);
	const is_local = useStoreState(instanceState, (s) => s.is_local);
	const is_wavelength = useStoreState(instanceState, (s) => s.wavelength_zone_id);
	const compute_subscription_id = useStoreState(instanceState, (s) => s.compute_subscription_id);
	const is_being_modified = useStoreState(
		instanceState,
		(s) => !['CREATE_COMPLETE', 'UPDATE_COMPLETE'].includes(s.status)
	);
	const is_unpaid = useStoreState(appState, (s) => s.customer?.is_unpaid);

	const filteredProducts = useStoreState(
		appState,
		(s) => s.products[is_local ? 'local_compute' : is_wavelength ? 'wavelength_compute' : 'cloud_compute']
	);
	const filteredSubscriptions = useStoreState(appState, (s) =>
		s.subscriptions[is_local ? 'local_compute' : is_wavelength ? 'wavelength_compute' : 'cloud_compute'].filter(
			(p) => p.value.compute_subscription_id === compute_subscription_id || p.value.compute_quantity_available
		)
	);
	const [formState, setFormState] = useState({});
	const [formData, setFormData] = useState({ compute_stack_id, customer_id, ...compute });
	const [hasChanged, setHasChanged] = useState(false);

	const products = showPrepaidCompute ? filteredSubscriptions : filteredProducts;
	const selectedProduct = products.find(
		(p) =>
			p.value.stripe_plan_id === formData.stripe_plan_id &&
			p.value.compute_subscription_id === formData.compute_subscription_id
	);
	const totalFreeCloudInstances = auth.orgs
		.filter((o) => auth.user_id === o.owner_user_id)
		.reduce((a, b) => a + b.free_cloud_instance_count, 0);
	const canAddFreeCloudInstance = totalFreeCloudInstances < config.free_cloud_instance_limit;
	const newTotal = (storage?.storage_price || 0) + (formData?.compute_price || 0);
	const newTotalString = newTotal ? `${commaNumbers(newTotal.toFixed(2))}/${compute.compute_interval}` : 'FREE';

	const resetFormData = () => setFormData({ compute_stack_id, customer_id, ...compute });

	useAsyncEffect(resetFormData, [showPrepaidCompute]);

	useAsyncEffect(() => {
		setHasChanged(
			compute?.stripe_plan_id !== formData.stripe_plan_id ||
				formData.compute_subscription_id !== compute?.compute_subscription_id
		);
	}, [formData]);

	useAsyncEffect(() => {
		setHasChanged(false);
	}, [compute_stack_id]);

	useAsyncEffect(async () => {
		const { submitted } = formState;
		if (submitted) {
			if (!newTotal && !formData.compute_subscription_id && !is_local && !canAddFreeCloudInstance) {
				alert.error(
					`You are limited to ${config.free_cloud_instance_limit} free cloud instance${config.free_cloud_instance_limit !== 1 ? 's' : ''}`
				);
				resetFormData();
				setFormState({});
			} else {
				setInstanceAction('Updating');
				const response = await updateInstance({ auth, ...formData });

				if (response.error) {
					alert.error('There was an error updating your instance. Please try again later.');
					setInstanceAction(false);
				} else {
					if (window._kmq)
						window._kmq.push([
							'record',
							'upgrade instance - RAM',
							{
								totalPrice: formData?.compute_price,
								currency: 'USD',
								products: [
									{ name: 'compute', id: selectedProduct.compute_ram_string, price: formData?.compute_price || 0 },
								],
							},
						]);
					alert.success('Instance update initialized successfully');
					appState.update((s) => {
						s.lastUpdate = Date.now();
					});
					setTimeout(() => navigate(`/o/${customer_id}/instances`), 100);
				}
			}
		}
	}, [formState]);

	return is_being_modified ? (
		<Card className="error">
			<CardBody>instance updating. please wait.</CardBody>
		</Card>
	) : (
		<>
			<SelectDropdown
				className="react-select-container"
				classNamePrefix="react-select"
				onChange={({ value }) => setFormData({ ...formData, ...value })}
				options={products.filter((p) => p.value.active)}
				value={selectedProduct}
				defaultValue={compute}
				isSearchable={false}
				isClearable={false}
				isLoading={!products}
				placeholder="select a RAM allotment"
				styles={{ placeholder: (styles) => ({ ...styles, textAlign: 'center', width: '100%', color: '#BCBCBC' }) }}
			/>
			{hasChanged && !newTotal && !formData.compute_subscription_id && !is_local && !canAddFreeCloudInstance ? (
				<Card className="error mt-2">
					<CardBody>
						You are limited to {config.free_cloud_instance_limit} free cloud instance
						{config.free_cloud_instance_limit !== 1 ? 's' : ''}
					</CardBody>
				</Card>
			) : hasChanged && (storage?.storage_price || formData?.compute_price) && badCard ? (
				<div className="mt-3">
					<BadCard />
					<VisitCard
						disabled={!hasChanged || formState.submitted}
						label="Update Credit Card"
						onClick={() => navigate(`/o/${customer_id}/billing?returnURL=/${customer_id}/i/${compute_stack_id}/config`)}
					/>
				</div>
			) : hasChanged && (storage?.storage_price || formData?.compute_price) && !hasCard && !is_unpaid ? (
				<VisitCard
					disabled={!hasChanged || formState.submitted}
					label="Add Credit Card To Account"
					onClick={() => navigate(`/o/${customer_id}/billing?returnURL=/${customer_id}/i/${compute_stack_id}/config`)}
				/>
			) : hasChanged ? (
				<>
					<ChangeSummary
						which="compute"
						compute={formData.compute_price_string_with_interval}
						storage={storage?.storage_price_string_with_interval || 'FREE'}
						total={newTotalString}
					/>
					<Row>
						<Col>
							<Button
								id="cancelChange"
								onClick={resetFormData}
								title="Cancel"
								block
								disabled={formState.submitted}
								color="grey"
							>
								Cancel
							</Button>
						</Col>
						<Col>
							<Button
								id="confirmChange"
								onClick={() => setFormState({ submitted: true })}
								title="Confirm Instance Details"
								block
								disabled={!hasChanged || formState.submitted}
								color="success"
							>
								Update
							</Button>
						</Col>
					</Row>
				</>
			) : null}
		</>
	);
}

export default UpdateRAM;
