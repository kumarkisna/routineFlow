import assert from 'node:assert/strict';
import test from 'node:test';
import { nextPlaylistCursor, parsePlaylistQueue, parsePlaylists, playablePlaylistIds, validatePlaylist } from './playlists';
import type { Routine } from '../types/routines';

const routine = (id: string, hidden = false, hiddenStep = false): Routine => ({
  id, title: id, subtitle: '', icon: 'sunny-outline', tone: 'coral',
  createdAt: '', hidden, steps: [{ id: `${id}-step`, title: 'Step', durationSeconds: 1, hidden: hiddenStep }],
});
test('playlist runs retain order and repeats, excluding missing or inactive routines', () => {
  assert.deepEqual(playablePlaylistIds(['b', 'gone', 'a', 'hidden', 'empty', 'b'],
    [routine('a'), routine('b'), routine('hidden', true), routine('empty', false, true)]),
  ['b', 'a', 'b']);
});
test('playlist names and at least one routine are required', () => {
  assert.throws(() => validatePlaylist(' ', ['a']));
  assert.throws(() => validatePlaylist('Morning', []));
  assert.throws(() => validatePlaylist('Morning', Array(101).fill('a')));
  assert.doesNotThrow(() => validatePlaylist('Morning', ['a', 'a']));
});
test('saved playlist parsing keeps ordered identifiers and rejects corrupt storage', () => {
  const list = [{ id: 'p', title: 'Morning', routineIds: ['b', 'a', 'b'] }];
  assert.deepEqual(parsePlaylists(JSON.stringify(list)), list);
  assert.throws(() => parsePlaylists('{}'));
  assert.throws(() => parsePlaylists('[{"id":"p","title":"Morning","routineIds":[12]}]'));
});
test('run queue parsing rejects invalid route data', () => {
  assert.deepEqual(parsePlaylistQueue('["b","a","b"]'), ['b', 'a', 'b']);
  assert.equal(parsePlaylistQueue('nope'), null);
  assert.equal(parsePlaylistQueue('[1]'), null);
  assert.equal(parsePlaylistQueue('[]'), null);
});
test('automatic progression skips removed/hidden routines and handles repeats and the final routine', () => {
  const routines = [routine('a'), routine('b'), routine('hidden', true)];
  const ids = ['a', 'gone', 'hidden', 'a', 'b'];
  assert.equal(nextPlaylistCursor(ids, 0, routines), 3);
  assert.equal(nextPlaylistCursor(ids, 3, routines), 4);
  assert.equal(nextPlaylistCursor(ids, 4, routines), -1);
});