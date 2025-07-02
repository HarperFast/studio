import React, { useState } from 'react';
import { Button, Card, CardBody, Col, Row } from 'reactstrap';
import useAsyncEffect from 'use-async-effect';
import { useParams, useNavigate } from 'react-router-dom';
import { useStoreState } from 'pullstate';

import appState from '../../../functions/state/appState';
import useNewInstance from '../../../functions/state/newInstance';
import ContentContainer from '../../shared/ContentContainer';
import RadioCheckbox from '../../shared/RadioCheckbox';
import DetailsSubheader from './DetailsSubheader';

function DetailsLocal() {
	const navigate = useNavigate();
	const { customer_id } = useParams();
	const is_unpaid = useStoreState(appState, (s) => s.customer.is_unpaid);
	const unlimited_local_install = useStoreState(appState, (s) => s.customer.unlimited_local_install);
	const [newInstance, setNewInstance] = useNewInstance({});
	const unusedCompute = useStoreState(
		appState,
		(s) =>
			s.subscriptions?.local_compute.filter(
				(p) => !p.value.compute_subscription_name || p.value.compute_quantity_available
			) || []
	);
	const products = useStoreState(
		appState,
		(s) => (newInstance.showPrepaidCompute ? unusedCompute : s.products.local_compute.filter((p) => p.value.active)),
		[newInstance.showPrepaidCompute]
	);
	const hasCard = useStoreState(appState, (s) => s.hasCard);
	const [formState, setFormState] = useState({});
	const [formData, setFormData] = useState({ ...products[0]?.value, ...newInstance });
	const isFree = !formData.compute_price || !!formData.compute_subscription_id;
	const needsCard = products && !hasCard && !isFree && !is_unpaid && !unlimited_local_install;

	useAsyncEffect(() => {
		const { submitted } = formState;
		const { stripe_plan_id } = formData;
		if (submitted) {
			if (stripe_plan_id) {
				setNewInstance({ ...newInstance, ...formData });
				setTimeout(
					() =>
						navigate(needsCard ? `/o/${customer_id}/instances/new/payment` : `/o/${customer_id}/instances/new/confirm`),
					0
				);
			} else {
				setFormState({ error: 'All fields must be filled out.' });
			}
		}
	}, [formState]);

	return (
		<>
			<Card>
				<CardBody>
					<ContentContainer
						header="Instance RAM"
						subheader={
							<DetailsSubheader
								hasPrepaid={unusedCompute.length}
								newInstance={newInstance}
								setNewInstance={setNewInstance}
								toggleValue="showPrepaidCompute"
							/>
						}
						maxHeight="240px"
					>
						<RadioCheckbox
							className="radio-button"
							type="radio"
							required
							onChange={(value) => setFormData({ ...formData, ...value })}
							options={products}
							defaultValue={products[0]}
						/>
					</ContentContainer>
				</CardBody>
			</Card>
			<Row>
				<Col sm="6">
					<Button
						id="backToBasicInfo"
						onClick={() => navigate(`/o/${customer_id}/instances/new/meta_local`)}
						title="Back to Basic Info"
						block
						className="mt-3"
						color="purple"
					>
						<i className="fa fa-chevron-circle-left me-2" />
						Basic Info
					</Button>
				</Col>
				<Col sm="6">
					<Button
						id={needsCard ? 'addPaymentMethod' : 'confirmInstanceDetails'}
						onClick={() => setFormState({ submitted: true })}
						title={needsCard ? 'Add Payment Method' : 'Confirm Instance Details'}
						block
						className="mt-3"
						color="purple"
					>
						{needsCard ? 'Add Payment Method' : 'Confirm Instance Details'}
						<i className="fa fa-chevron-circle-right ms-2" />
					</Button>
				</Col>
			</Row>
			{formState.error && (
				<Card className="mt-3 error">
					<CardBody>{formState.error}</CardBody>
				</Card>
			)}
		</>
	);
}

export default DetailsLocal;
