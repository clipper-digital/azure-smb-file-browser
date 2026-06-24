// Unit tests for AzureBlobStorageService.listDirectory date handling.
// Uses Node's built-in test runner (node:test) — no extra dependencies.
// The Azure SDK is never called: containerClient.listBlobsByHierarchy is mocked.

// Set required env BEFORE requiring the module so its constructor succeeds
// without a real Azure account. dotenv.config() does not override existing vars.
process.env.AZURE_STORAGE_ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME || 'testaccount';
process.env.AZURE_STORAGE_ACCOUNT_KEY = process.env.AZURE_STORAGE_ACCOUNT_KEY || 'dGVzdGtleQ==';
process.env.AZURE_STORAGE_CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME || 'testcontainer';
// Force the account-name/key path (not a connection string).
delete process.env.AZURE_STORAGE_CONNECTION_STRING;

const test = require('node:test');
const assert = require('node:assert');
const AzureBlobStorageService = require('../lib/azureBlobStorage');

// Build an async-iterable that mimics listBlobsByHierarchy's return value.
function makeAsyncIterable(items) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) yield item;
    },
  };
}

test('listDirectory sorts files by lastModified (newest first), not createdOn', async () => {
  const service = new AzureBlobStorageService();

  // Crafted so createdOn order is the OPPOSITE of lastModified order.
  // If sorting used createdOn, the result order would be reversed.
  const blobItems = [
    {
      kind: 'blob',
      name: 'older-modified.pdf',
      properties: {
        contentLength: 100,
        createdOn: new Date('2026-06-20T00:00:00Z'), // created most recently
        lastModified: new Date('2026-06-01T00:00:00Z'), // modified long ago
      },
    },
    {
      kind: 'blob',
      name: 'newer-modified.pdf',
      properties: {
        contentLength: 200,
        createdOn: new Date('2026-06-02T00:00:00Z'), // created earliest
        lastModified: new Date('2026-06-23T00:00:00Z'), // modified most recently
      },
    },
  ];

  service.containerClient.listBlobsByHierarchy = () => makeAsyncIterable(blobItems);

  const result = await service.listDirectory('');

  // Newest lastModified must come first.
  assert.deepStrictEqual(
    result.map((i) => i.name),
    ['newer-modified.pdf', 'older-modified.pdf']
  );
  assert.strictEqual(result[0].lastModified.toISOString(), '2026-06-23T00:00:00.000Z');
});

test('listDirectory exposes lastModified and no longer returns createdOn', async () => {
  const service = new AzureBlobStorageService();

  const blobItems = [
    {
      kind: 'blob',
      name: 'file.pdf',
      properties: {
        contentLength: 10,
        createdOn: new Date('2026-06-02T00:00:00Z'),
        lastModified: new Date('2026-06-23T18:21:18Z'),
      },
    },
  ];

  service.containerClient.listBlobsByHierarchy = () => makeAsyncIterable(blobItems);

  const [file] = await service.listDirectory('');

  assert.ok(file.lastModified instanceof Date, 'lastModified should be present');
  assert.strictEqual(file.createdOn, undefined, 'createdOn should not be returned');
});

test('listDirectory lists directories before files', async () => {
  const service = new AzureBlobStorageService();

  const items = [
    {
      kind: 'blob',
      name: 'a-file.pdf',
      properties: {
        contentLength: 1,
        createdOn: new Date('2026-06-23T00:00:00Z'),
        lastModified: new Date('2026-06-23T00:00:00Z'),
      },
    },
    { kind: 'prefix', name: 'z-folder/' },
  ];

  service.containerClient.listBlobsByHierarchy = () => makeAsyncIterable(items);

  const result = await service.listDirectory('');

  assert.strictEqual(result[0].type, 'directory');
  assert.strictEqual(result[0].name, 'z-folder');
  assert.strictEqual(result[1].type, 'file');
});
