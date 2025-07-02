import React, { useState, useEffect, createRef } from 'react';
import { Input, Button, Row, Col, CardBody, Card } from 'reactstrap';
import { ErrorBoundary } from 'react-error-boundary';

import ErrorFallback from '../../shared/ErrorFallback';
import addError from '../../../functions/api/lms/addError';

function QueryWindow({ setQuery, query }) {
	const [formData, setFormData] = useState('');
	const [formState, setFormState] = useState(false);
	const submitRef = createRef();

	useEffect(() => {
		if (query) {
			setFormState({ submitted: false });
			setFormData(query.query || query);
			submitRef.current.focus();
		}
		// eslint-disable-next-line
	}, [query]);

	useEffect(() => {
		const temp = formData;
		const detabbed = temp.length ? temp.replace(/[\t\n\r]/gm, '') : '';

		if (formState.submitted && detabbed.length) {
			setQuery({ lastUpdate: Date.now(), query: formData.trim() });
			setFormData(formData.trim());
			setFormState({ submitted: false });
		} else if (formState.submitted) {
			setFormData('');
			setFormState({ submitted: false });
		}
		// eslint-disable-next-line
	}, [formState]);

	return (
		<ErrorBoundary
			onError={(error, componentStack) => addError({ error: { message: error.message, componentStack } })}
			FallbackComponent={ErrorFallback}
		>
			<div id="query-window">
				<span className="floating-card-header">sql query</span>
				<Card className="mt-3 mb-4">
					<CardBody>
						<div className="pb-3 border-white">
							SQL queries are intended for data examination using primary keys. For performant queries in your
							application, please use our{' '}
							<a href="https://docs.harperdb.io/docs/developers/rest" target="_blank" rel="noopener noreferrer">
								REST Interface
							</a>
						</div>
						<Input
							id="sql_query"
							type="textarea"
							className="sql-query-textarea"
							value={formData}
							onKeyDown={(e) => {
								if (e.code === 'Enter' && e.metaKey) {
									setFormState({ submitted: true });
								} else if (e.code === 'Tab') {
									e.preventDefault();
									document.execCommand('insertHTML', false, '&#009');
								}
							}}
							onChange={(e) => setFormData(e.target.value)}
						/>
						<Row>
							<Col>
								<Button
									color="grey"
									title="clear query"
									block
									className="mt-2"
									onClick={() => {
										setQuery(false);
										setFormData('');
									}}
								>
									Clear
								</Button>
							</Col>
							<Col>
								<Button
									id="executeQuery"
									innerRef={submitRef}
									title="execute query"
									color="success"
									block
									className="mt-2"
									onClick={() => setFormState({ submitted: true })}
								>
									Execute
								</Button>
							</Col>
						</Row>
					</CardBody>
				</Card>
			</div>
		</ErrorBoundary>
	);
}

export default QueryWindow;
