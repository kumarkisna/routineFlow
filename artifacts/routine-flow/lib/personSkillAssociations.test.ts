import assert from 'node:assert/strict';
import test from 'node:test';
import type { Routine } from '../types/routines';
import type { RoutinePlaylist } from './playlists';
import { createPersonStorage, PERSON_DATA_KEYS } from './personStorage';
import { getSkillAssociations } from './skills';

function routine(id: string, title: string, assignment: 'routine' | 'step'): Routine {
  return {
    id,
    title,
    subtitle: '',
    icon: 'sun',
    tone: 'sun',
    createdAt: '2026-10-06T00:00:00.000Z',
    ...(assignment === 'routine' ? { skillIds: ['skill-focus'] } : {}),
    steps: [{
      id: `${id}-step`,
      title: `${title} step`,
      durationSeconds: 30,
      ...(assignment === 'step' ? { skillIds: ['skill-focus'] } : {}),
    }],
  };
}

test('skill activity follows the active person when switching profiles and back', async () => {
  const values = new Map<string, string>();
  const backend = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); },
  };

  const profiles: Record<string, {
    routines: Routine[];
    playlists: RoutinePlaylist[];
  }> = {
    me: {
      routines: [routine('me-reset', 'My reset', 'routine')],
      playlists: [{ id: 'me-flow', title: 'My flow', routineIds: ['me-reset'] }],
    },
    'person-alex': {
      routines: [routine('alex-breathing', 'Alex breathing', 'step')],
      playlists: [{
        id: 'alex-flow',
        title: 'Alex flow',
        routineIds: ['alex-breathing'],
        skillIds: ['skill-focus'],
      }],
    },
  };

  for (const [personId, catalog] of Object.entries(profiles)) {
    const storage = createPersonStorage(personId, backend);
    await Promise.all([
      storage.setItem(PERSON_DATA_KEYS.skills, JSON.stringify([{ id: 'skill-focus', name: 'Focus' }])),
      storage.setItem(PERSON_DATA_KEYS.routines, JSON.stringify(catalog.routines)),
      storage.setItem(PERSON_DATA_KEYS.playlists, JSON.stringify(catalog.playlists)),
    ]);
  }

  for (const activePersonId of ['me', 'person-alex', 'me']) {
    const storage = createPersonStorage(activePersonId, backend);
    const [skillsJson, routinesJson, playlistsJson] = await Promise.all([
      storage.getItem(PERSON_DATA_KEYS.skills),
      storage.getItem(PERSON_DATA_KEYS.routines),
      storage.getItem(PERSON_DATA_KEYS.playlists),
    ]);
    assert.ok(skillsJson && routinesJson && playlistsJson);
    const [skill] = JSON.parse(skillsJson) as { id: string; name: string }[];
    const associations = getSkillAssociations(
      skill.id,
      JSON.parse(routinesJson) as Routine[],
      JSON.parse(playlistsJson) as RoutinePlaylist[],
    );
    const expected = activePersonId === 'me'
      ? { routine: 'My reset', playlist: 'My flow', directPlaylist: false }
      : { routine: 'Alex breathing', playlist: 'Alex flow', directPlaylist: true };

    assert.deepEqual(associations.routines.map(item => item.title), [expected.routine]);
    assert.deepEqual(associations.playlists.map(item => item.title), [expected.playlist]);
    assert.equal(associations.playlists[0].assignedToPlaylist, expected.directPlaylist);
    assert.deepEqual(associations.playlists[0].routines.map(item => item.title), [expected.routine]);
  }
});
