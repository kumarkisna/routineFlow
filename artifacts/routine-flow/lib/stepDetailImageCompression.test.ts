import assert from 'node:assert/strict';
import test from 'node:test';
import { compressImageToSize } from './stepDetailImageCompression';

test('oversized images are reduced progressively until they fit the attachment limit', async () => {
  const attempts: { actions: { resize: { width?: number; height?: number } }[]; quality: number }[] = [];
  const removed: string[] = [];
  const result = await compressImageToSize(
    { uri: 'camera-photo', width: 4000, height: 3000, maxBytes: 2_000_000 },
    {
      manipulate: async (_uri, actions, quality) => {
        attempts.push({ actions, quality });
        const presetIndex = attempts.length;
        return { uri: `compressed-${presetIndex}`, width: 3072, height: 2304 };
      },
      getFileSize: async uri => uri === 'compressed-1' ? 2_500_000 : 1_500_000,
      deleteTemporaryFile: async uri => { removed.push(uri); },
    },
  );

  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[0].actions, [{ resize: { width: 3072 } }]);
  assert.ok(attempts[1].quality < attempts[0].quality);
  assert.deepEqual(removed, ['compressed-1']);
  assert.equal(result.uri, 'compressed-2');
  assert.equal(result.size, 1_500_000);
});

test('images that cannot fit after compression are rejected and temporary copies are removed', async () => {
  const removed: string[] = [];
  await assert.rejects(
    compressImageToSize(
      { uri: 'library-photo', width: 3000, height: 4000, maxBytes: 2_000_000 },
      {
        manipulate: async (_uri, _actions, _quality) => ({ uri: `compressed-${removed.length + 1}`, width: 1_024, height: 1_365 }),
        getFileSize: async () => 2_100_000,
        deleteTemporaryFile: async uri => { removed.push(uri); },
      },
    ),
    /still larger than 2 MB after compression/,
  );

  assert.equal(removed.length, 10);
});
