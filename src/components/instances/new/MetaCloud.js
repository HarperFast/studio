import React, { useState } from 'react';
import { Col, Input, Row, Button, Card, CardBody } from 'reactstrap';
import useAsyncEffect from 'use-async-effect';
import { useParams, useNavigate } from 'react-router-dom';
import { useStoreState } from 'pullstate';

import appState from '../../../functions/state/appState';

import useNewInstance from '../../../functions/state/newInstance';
import ContentContainer from '../../shared/ContentContainer';
import isAlphaUnderscore from '../../../functions/util/isAlphaUnderscore';
import isAlphaNumericHyphen from '../../../functions/util/isAlphaNumericHyphen';

function MetaCloud() {
	const navigate = useNavigate();
	const { customer_id } = useParams();
	const platform = useStoreState(appState, (s) => (s.themes.length === 1 ? s.themes[0] : 'HarperDB'));
	const instanceNames = useStoreState(appState, (s) => s.instances.map((i) => i.instance_name));
	const subdomain = useStoreState(appState, (s) => s.customer?.subdomain);
	const [newInstance, setNewInstance] = useNewInstance({});
	const [formState, setFormState] = useState({});
	const [formData, setFormData] = useState({
		instance_name: newInstance.instance_name || '',
		user: newInstance.user || '',
		pass: newInstance.pass || '',
	});

	useAsyncEffect(() => {
		const { submitted } = formState;
		const { instance_name, user, pass } = formData;
		if (submitted) {
			if (instanceNames.includes(instance_name)) {
				setFormState({ error: `An instance named "${instance_name}" already exists` });
			} else if (!instance_name) {
				setFormState({ error: 'instance name is required' });
			} else if (!isAlphaNumericHyphen(instance_name)) {
				setFormState({ error: 'instance names must have only letters, numbers, and hyphens' });
			} else if (user && !isAlphaUnderscore(user)) {
				setFormState({ error: 'usernames must have only letters and underscores' });
			} else if (instance_name.length > 16) {
				setFormState({ error: 'instance names are limited to 16 characters' });
			} else if (instance_name.length && user.length && pass.length) {
				setNewInstance({
					...newInstance,
					instance_name: instance_name.replace(/-+$/, ''),
					user,
					pass,
					is_ssl: true,
					super: true,
				});
				setTimeout(() => navigate(`/o/${customer_id}/instances/new/details_cloud`), 0);
			} else {
				setFormState({ error: 'All fields must be filled out.' });
			}
		}
	}, [formState]);

	return (
		<>
			<Card id="cloudInstanceInfo">
				<CardBody>
					<ContentContainer header="Instance Name" subheader="letters, numbers, and hyphens only. 16 char max.">
						<Row>
							<Col sm="4" className="pt-2 text-nowrap text-grey">
								Example: &quot;cloud-1&quot;
							</Col>
							<Col sm="8">
								<Input
									id="instance_name"
									onChange={(e) =>
										setFormData({
											...formData,
											instance_name: e.target.value
												.replace(/^0+/, '')
												.replace(/^-+/, '')
												.replace(/[^a-z\d-]+/gi, '')
												.substring(0, 15)
												.toLowerCase(),
										})
									}
									type="text"
									title="instance_name"
									value={formData.instance_name}
								/>
							</Col>
						</Row>
						<hr className="my-2 d-none d-sm-block" />
						<Row>
							<Col sm="4" className="pt-2 mb-2 text-grey">
								Instance URL
							</Col>
							<Col sm="8" className="pt-2 text-center text-nowrap overflow-hidden text-truncate">
								{formData.instance_name ? (
									<i className="text-grey">
										{formData.instance_name}-{subdomain}.harperdbcloud.com
									</i>
								) : (
									<span className="text-lightgrey">enter a name above</span>
								)}
							</Col>
						</Row>
					</ContentContainer>

					<ContentContainer
						header="Create Instance Credentials"
						subheader="letters and underscores only. 250 char max."
					>
						<Row>
							<Col sm="4" className="pt-2 text-grey">
								Username
							</Col>
							<Col sm="8">
								<Input
									id="username"
									onChange={(e) => setFormData({ ...formData, user: e.target.value.substring(0, 249) })}
									type="text"
									title="username"
									value={formData.user}
								/>
							</Col>
						</Row>
						<hr className="my-2 d-none d-sm-block" />
						<Row>
							<Col sm="4" className="pt-2 text-grey">
								Password
							</Col>
							<Col sm="8">
								<Input
									id="password"
									onChange={(e) => setFormData({ ...formData, pass: e.target.value.substring(0, 249) })}
									type="password"
									title="password"
									value={formData.pass}
								/>
							</Col>
						</Row>
					</ContentContainer>
				</CardBody>
			</Card>
			<Row>
				<Col sm="6">
					<Button
						id="instanceTypeButton"
						onClick={() => navigate(`/o/${customer_id}/instances/new/type`)}
						title="Back to Instance Type"
						block
						className="mt-3"
						color="purple"
					>
						<i className="fa fa-chevron-circle-left me-2" />
						{platform === 'HarperDB' ? 'Cloud Provider' : 'Instance Type'}
					</Button>
				</Col>
				<Col sm="6">
					<Button
						id="instanceDetailsButton"
						onClick={() => setFormState({ submitted: true })}
						title="Instance Details"
						block
						className="mt-3"
						color="purple"
					>
						Instance Details
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

export default MetaCloud;
