---
name: using-blob-datatype
description: How to use the Blob data type for efficient binary storage in Harper.
metadata:
  mode: synthesized
---

# Using Blob Datatype

Instructions for the agent to follow when working with the Blob data type in Harper.

## When to Use

Use this skill when you need to store unstructured or large binary data (media, documents) that is too large for standard JSON fields. Blobs provide efficient storage and integrated streaming support.

## How It Works

1. **Define Blob Fields**: In your GraphQL schema, use the `Blob` type:
   ```graphql
   type MyTable @table {
   	id: ID @primaryKey
   	data: Blob
   }
   ```
2. **Create and Store Blobs**: Use `createBlob()` from Harper's globals to wrap Buffers or Streams:
   ```javascript
   import { tables } from 'harper';
   const blob = createBlob(largeBuffer);
   await tables.MyTable.put('my-id', { data: blob });
   ```
3. **Use Streaming (Optional)**: For very large files, pass a stream to `createBlob()` to avoid loading the entire file into memory.
4. **Read Blob Data**: Retrieve the record and use `.bytes()` or streaming interfaces on the blob field:
   ```javascript
   const record = await tables.MyTable.get('my-id');
   const buffer = await record.data.bytes();
   ```
5. **Ensure Write Completion**: Use `saveBeforeCommit: true` in `createBlob` options if you need the blob fully written before the record is committed.
6. **Handle Errors**: Attach error listeners to the blob object to handle streaming failures.
