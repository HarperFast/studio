import { z } from 'zod';

export const AddCSVDataFormSchema = z.object({
	fileData: z.string(),
	database: z.string(),
	table: z.string(),
});
