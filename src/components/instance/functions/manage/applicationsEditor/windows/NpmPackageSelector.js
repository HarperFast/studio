import React, { useState, useEffect } from 'react';
import { useDebounce } from 'use-debounce';
import cn from 'classnames';
import SelectDropdown from 'react-select';

import { findNpmPackageName, getNpmDistTags } from './lib';

export default function NpmPackageSelector({ pkg, setPackageSpec }) {
	/*
	 * packageQuery is what's in the input field (@scope/package)
	 * matchingPackage is the name of the package that matches the search exactly
	 */

	const [packageQuery, setPackageQuery] = useState('');
	const [debouncedPackageQuery] = useDebounce(packageQuery, 300);
	const [distTags, setDistTags] = useState('');
	const [selectedDistTag, setSelectedDistTag] = useState('');
	const [matchingPackage, setMatchingPackage] = useState('');

	// result is a packageSepc
	// for package query status icons
	const [loadingTags, setLoadingTags] = useState(false);
	const [found, setFound] = useState(false);

	function updatePackageQuery(e) {
		setPackageQuery(e.target.value);
	}

	function updateSelectedDistTag({ value }) {
		setSelectedDistTag(value);
	}

	useEffect(() => {
		setPackageQuery(pkg?.package || '');
	}, [pkg]);

	// searches npm using current, debounced query
	// returns an exactly matching package name if it exists
	// loads available tags if package name exists

	function updatePackageSpec() {
		if (matchingPackage) {
			const npmPackageSpecifier = selectedDistTag ? `${matchingPackage}@${selectedDistTag}` : matchingPackage;
			setPackageSpec(npmPackageSpecifier);
		} else {
			setPackageSpec('');
		}
	}

	useEffect(updatePackageSpec, [matchingPackage, selectedDistTag, setPackageSpec]);

	function updatePackageAndTags() {
		if (debouncedPackageQuery) {
			setLoadingTags(true);
			findNpmPackageName(debouncedPackageQuery)
				.then((packageName) => {
					setLoadingTags(false);
					setFound(!!packageName);
					setMatchingPackage(packageName);

					if (packageName) {
						getNpmDistTags(packageName)
							.then((tags) => {
								setDistTags(tags);
								setSelectedDistTag(null);
							})
							.catch((e) => {
								throw e;
							});
					}
				})
				.catch(() => {
					setLoadingTags(false);
				});
		} else {
			setMatchingPackage(null);
			setDistTags(null);
			setSelectedDistTag(null);
		}
	}

	useEffect(updatePackageAndTags, [debouncedPackageQuery]);

	return (
		<>
			<div className="input-group">
				<input
					className="mt-2 form-control"
					title="enter an npm package specifier"
					value={packageQuery}
					placeholder="Enter the [@scope]/package"
					onChange={updatePackageQuery}
				/>
				<div className="input-group-append">
					<i
						className={cn('input-group-text fa mt-2', {
							'fa-spinner fa-spin loading': loadingTags,
							'fa-check found': debouncedPackageQuery.length > 0 && found,
							'fa-times not-found': debouncedPackageQuery.length > 0 && !(loadingTags || found),
							'fa-check not-searching': debouncedPackageQuery.length === 0,
						})}
					/>
				</div>
			</div>

			<SelectDropdown
				className="react-select-container mt-2"
				classNamePrefix="react-select"
				isDisabled={!packageQuery}
				placeholder="Choose a tag"
				disabled={!distTags}
				onChange={updateSelectedDistTag}
				options={Object.entries(distTags || []).map(([tagName, tagValue]) => ({
					label: `${tagName} (${tagValue})`,
					value: tagName,
				}))}
			/>
		</>
	);
}
