import React, { useEffect, useState } from 'react';
import { Modal, ModalHeader, ModalBody, Input, Button, Row, Col, Card, CardBody } from 'reactstrap';
import { useNavigate } from 'react-router-dom';
import { useStoreState } from 'pullstate';
import useAsyncEffect from 'use-async-effect';
import { ErrorBoundary } from 'react-error-boundary';

import appState from '../../../functions/state/appState';

import ContentContainer from '../../shared/ContentContainer';
import handleAddOrg from '../../../functions/organizations/handleAddOrg';
import getUser from '../../../functions/api/lms/getUser';
import ErrorFallback from '../../shared/ErrorFallback';
import addError from '../../../functions/api/lms/addError';

function NewOrgIndex() {
	const auth = useStoreState(appState, (s) => s.auth);
	const theme = useStoreState(appState, (s) => s.theme);
	const navigate = useNavigate();
	const [formData, setFormData] = useState({});
	const [formState, setFormState] = useState({});
	const [showToolTip, setShowToolTip] = useState(false);

	const closeModal = () => navigate(`/organizations`);

	useAsyncEffect(async () => {
		if (formState.submitted) {
			setShowToolTip(false);
			const newFormState = await handleAddOrg({ formData, auth });
			setFormState(newFormState);
			if (!newFormState.error) {
				await getUser(auth);
				closeModal();
			}
		}
	}, [formState]);

	useEffect(() => {
		if (!formState.submitted) setFormState({});
		// eslint-disable-next-line
	}, [formData]);

	return (
		<Modal id="new-org-modal" isOpen className={theme} centered fade={false}>
			<ErrorBoundary
				onError={(error, componentStack) => addError({ error: { message: error.message, componentStack } })}
				FallbackComponent={ErrorFallback}
			>
				{auth.email_bounced ? (
					<ModalBody>
						<Card>
							<CardBody>
								<div className="p-4 pb-0 text-center">
									<b>Unable to Create New Organization</b>
									<br />
									<br />
									Your email address seems to be unreachable. Please update it to ensure billing, upgrade, and other
									critical system announcements reach you.
								</div>
								<Row>
									<Col sm="6">
										<Button
											id="cancelNewOrg"
											onClick={() => navigate('/organizations')}
											title="Cancel New Org"
											block
											className="mt-3"
											color="grey"
										>
											Cancel
										</Button>
									</Col>
									<Col sm="6">
										<Button
											id="updateEmail"
											onClick={() => navigate('/profile')}
											title="Update My Email"
											block
											className="mt-3"
											color="danger"
										>
											Update My Email
										</Button>
									</Col>
								</Row>
							</CardBody>
						</Card>
					</ModalBody>
				) : formState.submitted ? (
					<ModalBody>
						<Card>
							<CardBody>
								<div className="p-4 text-center">
									<b>Creating Your Organization</b>
									<br />
									<br />
									<br />
									<i className="fa fa-lg fa-spinner fa-spin text-purple mb-4" />
									<br />
									<br />
									The Organization Otterhound is fetching your stuff.
								</div>
							</CardBody>
						</Card>
					</ModalBody>
				) : formState.success ? (
					<ModalBody>
						<Card>
							<CardBody>
								<div className="p-4 text-center">
									<b>Success</b>
									<br />
									<br />
									<br />
									<i className="fa fa-lg fa-thumbs-up text-purple mb-4" />
									<br />
									<br />
									Your organization was created successfully.
								</div>
							</CardBody>
						</Card>
					</ModalBody>
				) : (
					<>
						<ModalHeader toggle={closeModal}>Add New Organization</ModalHeader>
						<ModalBody>
							<Card className="mb-3">
								<CardBody>
									<ContentContainer header="Name">
										<Row>
											<Col sm="4" className="pt-2 text-nowrap text-grey">
												Ex: &quot;My Org&quot;
											</Col>
											<Col sm="8">
												<Input
													id="org_name"
													className="text-center"
													onChange={(e) => setFormData({ ...formData, org: e.target.value })}
													type="text"
													title="name"
													value={formData.org || ''}
												/>
											</Col>
										</Row>
									</ContentContainer>
									<ContentContainer header="Subdomain" subheader="alphanumeric only. 16 char max.">
										<Row>
											<Col sm="4" className="pt-2 text-nowrap text-grey">
												Ex: &quot;myorg&quot;&nbsp;
												<Button color="link" title="Learn more" onClick={() => setShowToolTip(!showToolTip)}>
													<i className="fa fa-question-circle text-purple" />
												</Button>
											</Col>
											<Col sm="8">
												<Input
													id="subdomain"
													className="text-center"
													type="text"
													title="subdomain"
													value={formData.subdomain || ''}
													disabled={formState.submitted}
													onChange={(e) =>
														setFormData({ ...formData, subdomain: e.target.value.substring(0, 15).toLowerCase() })
													}
												/>
											</Col>
										</Row>
										{showToolTip && (
											<div className="text-center pt-2 pb-1 text-lightpurple text-small">
												<i>Part of the URL of your Harper Cloud Instances- see below.</i>
											</div>
										)}
										<hr className="my-2 d-none d-sm-block" />
										<Row>
											<Col xs="12" className="pt-2 text-center text-nowrap overflow-hidden text-truncate">
												{formData.subdomain ? (
													<i className="text-grey">INSTANCE_NAME-{formData.subdomain}.harperdbcloud.com</i>
												) : (
													<span className="text-lightgrey">INSTANCE_NAME-SUBDOMAIN.harperdbcloud.com</span>
												)}
											</Col>
										</Row>
									</ContentContainer>
								</CardBody>
							</Card>
							<Button
								id="createOrganization"
								onClick={() => setFormState({ submitted: true })}
								title="Create Organization"
								block
								className="mt-3"
								color="success"
							>
								Create Organization
							</Button>
							{formState.error && (
								<Card className="mt-3 error">
									<CardBody>{formState.error}</CardBody>
								</Card>
							)}
						</ModalBody>
					</>
				)}
			</ErrorBoundary>
		</Modal>
	);
}

export default NewOrgIndex;
