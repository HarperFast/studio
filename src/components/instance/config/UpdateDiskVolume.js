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
import VisitCard from '../../shared/VisitCard';
import updateInstance from '../../../functions/api/lms/updateInstance';
import commaNumbers from '../../../functions/util/commaNumbers';

function UpdateDiskVolume({ setInstanceAction, showPrepaidStorage }) {
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
	const is_being_modified = useStoreState(
		instanceState,
		(s) => !['CREATE_COMPLETE', 'UPDATE_COMPLETE'].includes(s.status)
	);
	const last_volume_resize = useStoreState(instanceState, (s) => s.last_volume_resize);
	const data_volume_size = useStoreState(instanceState, (s) => s.data_volume_size);

	const filteredProducts = useStoreState(appState, (s) =>
		s.products.cloud_storage.filter((p) => p.value.data_volume_size >= storage?.data_volume_size)
	);
	const filteredSubscriptions = useStoreState(appState, (s) =>
		s.subscriptions.cloud_storage.filter(
			(p) =>
				(p.value.data_volume_size === data_volume_size ||
					p.value.storage_quantity_available >= p.value.data_volume_size) &&
				p.value.data_volume_size >= storage?.data_volume_size
		)
	);

	const [formState, setFormState] = useState({});
	const [formData, setFormData] = useState({ compute_stack_id, customer_id, ...storage });
	const [hasChanged, setHasChanged] = useState(false);

	const products = showPrepaidStorage ? filteredSubscriptions : filteredProducts;
	const selectedProduct = products.find(
		(p) =>
			p.value.data_volume_size === formData.data_volume_size &&
			p.value.stripe_storage_plan_id === formData.stripe_storage_plan_id &&
			p.value.storage_subscription_id === formData.storage_subscription_id
	);
	const totalFreeCloudInstances = auth.orgs
		.filter((o) => auth.user_id === o.owner_user_id)
		.reduce((a, b) => a + b.free_cloud_instance_count, 0);
	const canAddFreeCloudInstance = totalFreeCloudInstances < config.free_cloud_instance_limit;
	const newTotal = (formData?.storage_price || 0) + (compute?.compute_price || 0);
	const newTotalString = newTotal ? `${commaNumbers(newTotal.toFixed(2))}/${compute.compute_interval}` : 'FREE';
	const canChange = last_volume_resize ? (Date.now() - new Date(last_volume_resize).getTime()) / 1000 / 3600 > 6 : true;

	const resetFormData = () => setFormData({ compute_stack_id, customer_id, ...storage });

	useAsyncEffect(resetFormData, [showPrepaidStorage]);

	useAsyncEffect(() => {
		setHasChanged(
			storage?.data_volume_size !== formData.data_volume_size ||
				storage?.stripe_storage_plan_id !== formData.stripe_storage_plan_id ||
				storage?.storage_subscription_id !== formData.storage_subscription_id
		);
	}, [formData]);

	useAsyncEffect(() => {
		setHasChanged(false);
	}, [compute_stack_id]);

	useAsyncEffect(async () => {
		const { submitted } = formState;
		if (submitted) {
			setInstanceAction('Updating');
			const response = await updateInstance({ auth, ...formData });
			if (response.error) {
				alert.error('There was an error updating your instance. Please try again later.');
				setInstanceAction(false);
			} else {
				if (window._kmq)
					window._kmq.push([
						'record',
						'upgrade instance - disk size',
						{
							totalPrice: formData?.compute_price,
							currency: 'USD',
							products: [
								{ name: 'storage', id: selectedProduct.data_volume_size_string, price: formData?.storage_price || 0 },
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
				defaultValue={storage}
				isSearchable={false}
				isClearable={false}
				isLoading={!products}
				placeholder="Select Data Volume Size"
				styles={{ placeholder: (styles) => ({ ...styles, textAlign: 'center', width: '100%', color: '#BCBCBC' }) }}
			/>
			{hasChanged && !formData.storage_subscription_id && !newTotal && !is_local && !canAddFreeCloudInstance ? (
				<Card className="error mt-3">
					<CardBody>
						You are limited to {config.free_cloud_instance_limit} free cloud instance
						{config.free_cloud_instance_limit !== 1 ? 's' : ''}
					</CardBody>
				</Card>
			) : hasChanged && !canChange ? (
				<Card className="error mt-3 text-start">
					<CardBody>
						You may update disk size every 6 hours
						<br />
						<br />
						Last resize: {new Date(last_volume_resize).toLocaleTimeString()}
						<br />
						<br />
						Try again at: {new Date(new Date(last_volume_resize).getTime() + 21600000).toLocaleTimeString()}
					</CardBody>
				</Card>
			) : hasChanged && (formData?.storage_price || compute?.compute_price) && badCard ? (
				<div className="mt-3">
					<BadCard />
					<VisitCard
						disabled={!hasChanged || formState.submitted}
						label="Update Credit Card"
						onClick={() => navigate(`/o/${customer_id}/billing?returnURL=/${customer_id}/i/${compute_stack_id}/config`)}
					/>
				</div>
			) : hasChanged && (formData?.storage_price || compute?.compute_price) && !hasCard ? (
				<VisitCard
					disabled={!hasChanged || formState.submitted}
					label="Add Credit Card To Account"
					onClick={() => navigate(`/o/${customer_id}/billing?returnURL=/${customer_id}/i/${compute_stack_id}/config`)}
				/>
			) : hasChanged ? (
				<>
					<ChangeSummary
						which="storage"
						compute={compute?.compute_price_string_with_interval}
						storage={formData?.storage_price_string_with_interval || 'FREE'}
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

export default UpdateDiskVolume;
