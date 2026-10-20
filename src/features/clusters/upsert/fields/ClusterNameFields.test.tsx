/**
 * @vitest-environment jsdom
 */
import { Form } from '@/components/ui/form/Form';
import { UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ClusterAbbreviatedName } from './ClusterAbbreviatedName';
import { ClusterName } from './ClusterName';

function ClusterNameFields() {
	const form = useForm<z.infer<typeof UpsertClusterSchema>>({
		defaultValues: { clusterName: '', abbreviatedName: '' },
	});
	return (
		<Form {...form}>
			<ClusterName className="" form={form} />
			<ClusterAbbreviatedName
				form={form}
				calculatedNames={{ suggestedAbbreviatedName: 'my-cluster', fullHostName: 'my-cluster.example.com' }}
			/>
		</Form>
	);
}

afterEach(cleanup);

describe('ClusterName', () => {
	it('stops the cluster name at the 255 characters the form accepts, and says so there', () => {
		render(<ClusterNameFields />);
		const name = screen.getByLabelText('Cluster Name') as HTMLInputElement;
		expect(name.maxLength).toBe(255);

		fireEvent.change(name, { target: { value: 'c'.repeat(255) } });
		expect(screen.getByText('Maximum 255 characters reached.')).toBeTruthy();
	});
});

describe('ClusterAbbreviatedName', () => {
	it('stops the host name at the 20 characters the form accepts, and says so there', () => {
		render(<ClusterNameFields />);
		const hostName = screen.getByLabelText('Host Name') as HTMLInputElement;
		expect(hostName.maxLength).toBe(20);

		fireEvent.change(hostName, { target: { value: 'h'.repeat(20) } });
		expect(screen.getByText('Maximum 20 characters reached.')).toBeTruthy();
	});
});
