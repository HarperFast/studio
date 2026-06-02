---
name: handling-binary-data
description: How to store and serve binary data like images or audio in Harper.
metadata:
  mode: synthesized
---

# Handling Binary Data

Instructions for the agent to follow when handling binary data in Harper.

## When to Use

Use this skill when you need to store binary files (images, audio, etc.) in the database or serve them back to clients via REST endpoints.

## How It Works

1. **Store Binary Data**: In your resource's `post` or `put` method, convert incoming data to Buffers and then to Blobs using `createBlob` from Harper's globals. Include the MIME type if available:

   ```typescript
   async post(target, record) {
     if (record.data) {
       record.data = createBlob(Buffer.from(record.data, record.encoding || 'base64'), {
         type: record.contentType || 'application/octet-stream',
       });
     }
     return super.post(target, record);
   }
   ```

2. **Serve Binary Data**: In your resource's `get` method, return a response object with the appropriate `Content-Type` and the binary data in the `body`:
   ```typescript
   async get(target) {
    const record = await super.get(target);
    if (record?.data) {
      return {
        status: 200,
        headers: { 'Content-Type': record.data.type || 'application/octet-stream' },
        body: record.data,
      };
    }
    return record;
   }
   ```
3. **Use the Blob Type**: Ensure your GraphQL schema uses the `Blob` scalar for binary fields.
