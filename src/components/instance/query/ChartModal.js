import React, { useState } from 'react';
import { Modal, ModalBody, ModalHeader, Button, Row, Col, Input, Card, CardBody } from 'reactstrap';
import SelectDropdown from 'react-select';
import Chart from 'react-apexcharts';
import { useParams } from 'react-router-dom';
import { useStoreState } from 'pullstate';
import { useAlert } from 'react-alert';

import appState from '../../../functions/state/appState';
import addChart from '../../../functions/api/lms/addChart';
import chartOptions from '../../../functions/charts/chartOptions';
import chartTypes from '../../../functions/charts/chartTypes';
import isNumeric from '../../../functions/util/isNumeric';

function ChartModal({ setShowChartModal, tableData, query }) {
	const { compute_stack_id, customer_id } = useParams();
	const alert = useAlert();
	const [chart, setChart] = useState({
		customer_id,
		compute_stack_id,
		name: false,
		type: 'line',
		query,
		labelAttribute: false,
		seriesAttributes: [],
		shared: false,
	});
	const [submitted, setSubmitted] = useState(false);
	const auth = useStoreState(appState, (s) => s.auth);
	const theme = useStoreState(appState, (s) => s.theme);
	const attributes = Object.keys(tableData[0]);
	const excludeFromDataDropdown = [
		...chart.seriesAttributes,
		chart.labelAttribute,
		'__createdtime__',
		'__updatedtime__',
	];
	const showChart =
		chart.type === 'single value'
			? chart.seriesAttributes?.length
			: chart.type && chart.seriesAttributes?.length && chart.labelAttribute;
	const canSubmit =
		chart.type === 'single value'
			? chart.seriesAttributes.length && chart.name
			: chart.type && chart.labelAttribute && chart.seriesAttributes.length && chart.name;
	const singleSeriesAttribute = chartTypes.map((t) => t.singleSeriesAttribute && t.type).includes(chart.type);
	const options = chartOptions({
		title: chart.name || 'chart name',
		type: chart.type,
		labels: tableData.map((d) => d[chart.labelAttribute]),
		theme,
	});
	const series = singleSeriesAttribute
		? tableData.map((d) => d[chart.seriesAttributes[0]])
		: chart.seriesAttributes.map((s) => ({ name: s, data: tableData.map((d) => d[s]) }));
	const setChartType = (type) => {
		const shapeChange =
			chartTypes.find((t) => t.type === type).singleSeriesAttribute !==
			chartTypes.find((t) => t.type === chart.type).singleSeriesAttribute;
		setChart(shapeChange ? { ...chart, labelAttribute: false, seriesAttributes: [], type } : { ...chart, type });
	};
	const addLabelAttribute = (labelAttribute) => setChart({ ...chart, labelAttribute });
	const addSeriesAttribute = (attribute) =>
		setChart({
			...chart,
			seriesAttributes: singleSeriesAttribute ? [attribute] : [...chart.seriesAttributes, attribute],
		});
	const removeSeriesAttribute = (attribute) => {
		const attributeIndex = chart.seriesAttributes.indexOf(attribute);
		chart.seriesAttributes.splice(attributeIndex, 1);
		setChart({ ...chart, seriesAttributes: chart.seriesAttributes });
	};

	const handleAddChart = async () => {
		setSubmitted(true);
		const response = await addChart({ auth, ...chart });
		if (response.error) {
			alert.error(response.message);
			setSubmitted(false);
		} else {
			alert.success(response.message);
			setShowChartModal(false);
		}
	};

	return (
		<Modal
			id="chart-modal"
			size="lg"
			isOpen
			toggle={() => setShowChartModal(false)}
			className={theme}
			centered
			fade={false}
		>
			<ModalHeader toggle={() => setShowChartModal(false)}>Create Chart From This Query Data</ModalHeader>
			<ModalBody>
				<Row>
					<Col xs="12" className="py-2 query-text">
						<i>{query}</i>
					</Col>
					<Col xs="12">
						<hr className="my-2" />
					</Col>

					<Col lg="4">
						<SelectDropdown
							className="react-select-container limited-height"
							classNamePrefix="react-select"
							onChange={({ value }) => setChartType(value)}
							options={chartTypes.map((c) => ({ label: `${c.type}`, value: c.type }))}
							value={{ label: `chart type: ${chart.type}`, value: chart.type }}
							isSearchable={false}
							isClearable={false}
							placeholder="Chart Type"
							styles={{
								placeholder: (styles) => ({ ...styles, textAlign: 'center', width: '100%', color: '#BCBCBC' }),
							}}
						/>
					</Col>
					<Col xs="12" className="d-block d-lg-none">
						<hr className="my-2" />
					</Col>
					<Col lg="4">
						<SelectDropdown
							className="react-select-container limited-height"
							classNamePrefix="react-select"
							onChange={({ value }) => addSeriesAttribute(value)}
							options={attributes
								.filter((a) => !excludeFromDataDropdown.includes(a))
								.sort()
								.map((a) => ({ label: a, value: a }))}
							value={
								singleSeriesAttribute && chart.seriesAttributes.length
									? { label: `data column: ${chart.seriesAttributes[0]}`, value: chart.seriesAttributes[0] }
									: null
							}
							isSearchable={false}
							isClearable={false}
							isDisabled={!chart.type}
							placeholder={`${singleSeriesAttribute ? 'select' : 'add'} data column`}
							styles={{
								placeholder: (styles) => ({ ...styles, textAlign: 'center', width: '100%', color: '#BCBCBC' }),
							}}
						/>
					</Col>
					<Col lg="4">
						{chart.type !== 'single value' && (
							<>
								<hr className="d-block d-lg-none my-2" />
								<SelectDropdown
									className="react-select-container limited-height"
									classNamePrefix="react-select"
									onChange={({ value }) => addLabelAttribute(value)}
									options={attributes
										.filter((a) => !['__createdtime__', '__updatedtime__'].includes(a))
										.sort()
										.map((a) => ({ label: a, value: a }))}
									value={
										chart.labelAttribute
											? {
													label: `${singleSeriesAttribute ? 'label' : 'x-axis'}: ${chart.labelAttribute}`,
													value: chart.labelAttribute,
												}
											: null
									}
									isSearchable={false}
									isClearable={false}
									isDisabled={!chart.type}
									placeholder={`select ${singleSeriesAttribute ? 'label' : 'x-axis'} column`}
									styles={{
										placeholder: (styles) => ({ ...styles, textAlign: 'center', width: '100%', color: '#BCBCBC' }),
									}}
								/>
							</>
						)}
					</Col>
					<Col xs="12">
						<hr className="my-2" />
					</Col>
					<Col lg="4">
						<Input
							id="chart_name"
							type="text"
							placeholder="chart name"
							onChange={(e) => setChart({ ...chart, name: e.target.value })}
						/>
					</Col>
					<Col xs="12" className="d-block d-lg-none">
						<hr className="my-2" />
					</Col>
					<Col lg="4" className="py-2 text-nowrap d-flex justify-content-center align-items-center">
						<Button className="me-2" color="link" onClick={() => setChart({ ...chart, shared: !chart.shared })}>
							<i className={`fa fa-lg text-purple fa-toggle-${chart.shared ? 'on' : 'off'}`} />
						</Button>
						visible to all org users
					</Col>
					<Col xs="12" className="d-block d-lg-none">
						<hr className="my-2" />
					</Col>
					<Col lg="4">
						<Button onClick={handleAddChart} block disabled={!canSubmit || submitted} color="success">
							{submitted ? <i className="fa fa-spin fa-spinner" /> : <span>Add Chart</span>}
						</Button>
					</Col>
				</Row>
				{!singleSeriesAttribute && chart.seriesAttributes.length ? (
					<>
						<hr className="my-2" />
						<div className="">
							{chart.seriesAttributes.map((a) => (
								<Button color="danger" size="sm" className="me-2" onClick={() => removeSeriesAttribute(a)} key={a}>
									[x] {a}
								</Button>
							))}
						</div>
					</>
				) : null}
				<hr className="my-2" />
				<div className="chart-holder">
					{showChart && chart.type === 'single value' ? (
						<Card>
							<CardBody className="single-value-chart">
								<div className="title">{chart.name || 'chart name'}</div>
								<h1>{isNumeric(series[0]) ? series[0].toFixed(2) : series[0]}</h1>
							</CardBody>
						</Card>
					) : showChart ? (
						<Chart options={options} series={series} type={chart.type} height={220} />
					) : (
						<div className="text-center py-5 text-grey">
							please choose chart {!chart.type && 'type, '}label and data
						</div>
					)}
				</div>
			</ModalBody>
		</Modal>
	);
}

export default ChartModal;
