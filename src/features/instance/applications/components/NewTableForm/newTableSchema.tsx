import { databaseNameSchema } from '@/integrations/api/instance/database/databaseNameSchema';
import { fieldNameSchema } from '@/integrations/api/instance/database/fieldNameSchema';
import { FieldType } from '@/integrations/api/instance/database/fieldType';
import { tableNameSchema } from '@/integrations/api/instance/database/tableNameSchema';
import { z } from 'zod';

export const newTableSchema = z.object({
	tableName: tableNameSchema,
	databaseName: databaseNameSchema,
	expiration: z.int32().or(z.literal('')),
	enableRest: z.boolean(),
	sealed: z.boolean(),
	tableFields: z.array(
		z.object({
			fieldName: fieldNameSchema,
			fieldType: z.enum(FieldType),
			primaryKey: z.boolean(),
			nullable: z.boolean(),
			indexed: z.boolean(),
			array: z.boolean(),
		}),
	).min(1, { error: 'Please add at least one field.' }),
});
