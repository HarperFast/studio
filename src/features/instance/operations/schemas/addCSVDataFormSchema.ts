import { z } from 'zod';

export const AddCSVDataFormSchema = z.object({
  fileData: z
    .any(),
  // fileData: z
  //   .instanceof(File)
  //   .refine((file) => file.type === 'text/csv', {
  //     message: 'File must be a CSV',
  //   }),
  database: z.string(),
  table: z.string(),
});
