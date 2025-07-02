import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Button, Card, CardBody, Col, Row } from 'reactstrap';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import useAsyncEffect from 'use-async-effect';
import { useStoreState } from 'pullstate';
import { useAlert } from 'react-alert';
import { ErrorBoundary } from 'react-error-boundary';

import instanceState from '../../../functions/state/instanceState';
import appState from '../../../functions/state/appState';

import queryInstance from '../../../functions/api/queryInstance';
import addError from '../../../functions/api/lms/addError';
import ErrorFallback from '../../shared/ErrorFallback';

function JSONEditor({ newEntityAttributes, hashAttribute }) {
	const {
		customer_id,
		schema: encodedSchema,
		table: encodedTable,
		hash: encodedHash,
		action,
		compute_stack_id,
	} = useParams();

	// hash, table and schema can have uri components
	const schema = decodeURIComponent(encodedSchema);
	const table = decodeURIComponent(encodedTable);
	const hash = decodeURIComponent(encodedHash);

	const alert = useAlert();
	const { state: locationState } = useLocation();
	const navigate = useNavigate();
	const auth = useStoreState(instanceState, (s) => s.auth);
	const url = useStoreState(instanceState, (s) => s.url);
	const theme = useStoreState(appState, (s) => s.theme);
	const monacoRef = useRef(null);
	const [currentValue, setCurrentValue] = useState('{}');
	const [confirmDelete, setConfirmDelete] = useState();
	const [validJSON, setValidJSON] = useState(true);
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const baseUrl = `/o/${customer_id}/i/${compute_stack_id}/browse/${schema}/${table}`;
	const isAmbiguousNumber = (h) => `${parseFloat(h)}` === h;

	const updateEditorTheme = () => {
		/* adjust editor theme when studio theme changes */

		if (monacoRef.current?.editor?.setTheme) {
			monacoRef.current.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'light');
		}
	};

	const navigateBack = () => {
		if (!newEntityAttributes) {
			navigate(baseUrl);
		}
	};

	const initializeEditorContent = async () => {
		if (action === 'edit') {
			let hash_values;
			// we arrived at this view directly via url entered in (deeplink)
			if (locationState?.hashValue) {
				// NOTE: right now this if never executes because of the asyncEffect above that checks for newEntityAttributes and
				// redirects to baseUrl if not.

				// TODO: passing the hash_value through the navigate function and using location.state is a work
				// around for an architectural shortcoming that should be addressed.
				// reason: the sibling component BrowseDataTable is the source of the row data
				// and has the originally typed hash value, which it requests in paged blocks. this view page
				// is dependent on that for the real type of the hash_value because from here we only
				// have the hash_value via its stringified url value, we can't know its type (i.e. '100' or 100).
				//
				// passing the hash value through navigate/location allows this typed lookup to work, but
				// it's not intuitive and may make further refactoring painful.
				//
				// Probably makes more sense to refactor the architecture to consider the JsonViewer
				// (which should be renamed to JsonEditor since it's not just a viewing mechanism) as
				// a 'child' of the BrowseDataTable component so the row data can be passed to it.

				hash_values = [locationState.hashValue];
			} else {
				// request both integer as string and integer as integer values if it's ambiguous
				// since we have to guess at the moment.
				hash_values = isAmbiguousNumber(hash) ? [`${hash}`, parseInt(hash, 10)] : [hash];

				// TODO: we support floats, so how to disambiguate 4.0 from '4.0' here?
			}

			const result = await queryInstance({
				operation: {
					operation: 'search_by_hash',
					schema,
					table,
					hash_values,
					get_attributes: ['*'],
					onlyIfCached: true,
					noCacheStore: true,
				},
				auth,
				url,
			});

			const [rowData] = result;

			if (rowData) {
				const hash_attribute = rowData[hashAttribute];
				const createdtime = rowData.__createdtime__; // eslint-disable-line no-underscore-dangle
				const updatedtime = rowData.__updatedtime__; // eslint-disable-line no-underscore-dangle

				delete rowData.__createdtime__; // eslint-disable-line no-underscore-dangle
				delete rowData.__updatedtime__; // eslint-disable-line no-underscore-dangle
				delete rowData[hashAttribute];

				const newCurrentValue = {
					[hashAttribute]: hash_attribute,
					...rowData,
					__createdtime__: createdtime,
					__updatedtime__: updatedtime,
				};
				setCurrentValue(JSON.stringify(newCurrentValue, null, 4));
			} else {
				navigate(baseUrl);
				alert.error('Unable to find record with that hash_attribute');
			}
		} else {
			setCurrentValue(JSON.stringify(newEntityAttributes || {}, null, 4));
		}
	};

	const submitRecord = async (e) => {
		e.preventDefault();

		if (!validJSON) {
			alert.error('Please insert valid JSON to proceed');
		}

		if (!action || !validJSON) {
			return false;
		}

		setSaving(true);

		const rowObject = JSON.parse(currentValue);
		const payload = {
			operation: {
				operation: action === 'edit' ? 'update' : 'insert',
				schema,
				table,
				records: action !== 'edit' && Array.isArray(rowObject) ? rowObject : [rowObject],
			},
			auth,
			url,
		};
		const { error, message } = await queryInstance(payload);

		if (error) {
			alert.error(message);
			return setSaving(false);
		}

		instanceState.update((s) => {
			s.lastUpdate = Date.now();
		});
		return setTimeout(() => navigate(`/o/${customer_id}/i/${compute_stack_id}/browse/${schema}/${table}`), 1000);
	};

	const deleteRecord = async (e) => {
		e.preventDefault();

		if (!action) {
			return false;
		}

		setDeleting(true);

		const { error, message } = await queryInstance({
			operation: {
				operation: 'delete',
				schema,
				table,
				hash_values: [locationState.hashValue],
			},
			auth,
			url,
		});

		if (error) {
			alert.error(message);
			setConfirmDelete(false);
			return setDeleting(false);
		}

		return setTimeout(() => navigate(`/o/${customer_id}/i/${compute_stack_id}/browse/${schema}/${table}`), 100);
	};

	useEffect(updateEditorTheme, [theme]);
	useAsyncEffect(navigateBack, []);
	useAsyncEffect(initializeEditorContent, [hash]);

	return (
		<ErrorBoundary
			onError={(error, componentStack) => addError({ error: { message: error.message, componentStack } })}
			FallbackComponent={ErrorFallback}
		>
			<span className="floating-card-header">
				{schema} {table && '>'} {table} {action === 'add' ? '> add new' : hash ? `> edit > ${hash}` : ''}
				&nbsp;
			</span>
			<Card className="my-3">
				<CardBody>
					<ul className="text-small">
						{action === 'add' && (
							<>
								<li>
									The hash_attribute for this table is &quot;<b>{hashAttribute}</b>&quot;, and will auto-generate. You
									may manually add it if you want to specify its value.
								</li>
								<li>
									<b>You may paste in an array</b> if you want to add more than one record at a time.
								</li>
							</>
						)}
					</ul>
					<Card className="mb-2 json-editor-holder">
						<CardBody>
							<Editor
								height="350px"
								language="json"
								value={currentValue}
								theme="vs-dark"
								onValidate={(markers) => {
									// update validity state
									setValidJSON(markers.length === 0);
								}}
								onChange={(newValue) => {
									// update currentEditor status
									setCurrentValue(newValue);
								}}
								onMount={(editor, monaco) => {
									monacoRef.current = monaco;
								}}
							/>
						</CardBody>
					</Card>
					<Row>
						<Col md="4" className="mt-2">
							{confirmDelete ? (
								<div className="pt-2">Delete this record?</div>
							) : (
								<Button
									disabled={saving || deleting}
									id="backToTable"
									block
									color="black"
									onClick={() => navigate(`/o/${customer_id}/i/${compute_stack_id}/browse/${schema}/${table}`)}
								>
									<i className="fa fa-chevron-left" />
								</Button>
							)}
						</Col>
						{action === 'add' ? (
							<Col md="8">
								<Button
									disabled={saving || !validJSON}
									id="addEditItem"
									className="mt-2"
									onClick={submitRecord}
									block
									color="success"
								>
									<i className={`fa ${saving ? 'fa-spinner fa-spin' : 'fa-save'}`} />
								</Button>
							</Col>
						) : confirmDelete ? (
							<>
								<Col md="4" className="mt-2">
									<Button
										disabled={saving || deleting}
										id="cancelDelete"
										block
										color="black"
										onClick={() => setConfirmDelete(false)}
									>
										<i className="fa fa-ban" />
									</Button>
								</Col>
								<Col md="4">
									<Button
										disabled={saving || deleting}
										id="deleteRecord"
										className="mt-2"
										onClick={deleteRecord}
										block
										color="success"
									>
										<i className={`fa ${deleting ? 'fa-spinner fa-spin' : 'fa-check'}`} />
									</Button>
								</Col>
							</>
						) : (
							<>
								<Col md="4" className="mt-2">
									<Button
										disabled={saving || deleting}
										id="confirmDelete"
										block
										color="danger"
										onClick={() => setConfirmDelete(hash)}
									>
										<i className="fa fa-trash" />
									</Button>
								</Col>
								<Col md="4">
									<Button
										disabled={saving || !validJSON}
										id="addEditItem"
										className="mt-2"
										onClick={submitRecord}
										block
										color="success"
									>
										<i className={`fa ${saving ? 'fa-spinner fa-spin' : 'fa-save'}`} />
									</Button>
								</Col>
							</>
						)}
					</Row>
				</CardBody>
			</Card>
		</ErrorBoundary>
	);
}

export default JSONEditor;
