import animalsCsv from './animals.csv?raw';
import booksCsv from './books.csv?raw';
import dogsCsv from './dogs.csv?raw';

export interface SampleDataset {
	id: string;
	name: string;
	description: string;
	/** Table the dataset loads into by default (user-editable in the form). */
	table: string;
	csv: string;
}

// Bundled with the app (via ?raw) instead of fetched from a URL so imports work on any
// instance, including self-hosted ones with no outbound internet access. Keep these
// small and comma/quote-free — the validity test enforces the format.
export const sampleDatasets: SampleDataset[] = [
	{
		id: 'dogs',
		name: 'Dogs',
		description: 'The classic Harper demo — dogs and their humans',
		table: 'dog',
		csv: dogsCsv,
	},
	{
		id: 'books',
		name: 'Books',
		description: 'Classic literature with authors, genres, and ratings',
		table: 'book',
		csv: booksCsv,
	},
	{
		id: 'animals',
		name: 'Animals',
		description: 'Animal species with class, diet, and habitat data',
		table: 'animal',
		csv: animalsCsv,
	},
];
