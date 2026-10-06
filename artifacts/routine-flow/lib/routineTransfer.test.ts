/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MAX_ROUTINE_FILE_BYTES,
  mergeImportedProgress,
  mergeImportedRoutines,
  parseRoutinesFile,
  persistImportedBackup,
  repairStoredRoutineDurations,
  serializePersonBackup,
  serializeRoutines,
} from './routineTransfer';
import { makeRoutineCopy } from './copyRoutine';
import type { CompletionMap, Routine } from '@/types/routines';
import { getSpokenStepDetails, getStepDetails } from '@/types/routines';
import { getHistoryForDay } from './progressHistory';

const day = '2026-09-28';
const secondDay = '2026-09-29';

function routine(id = 'morning'): Routine {
  return {
    id,
    title: 'Morning',
    subtitle: 'Start well',
    icon: 'sunrise',
    tone: 'sun',
    createdAt: '2026-09-01T00:00:00.000Z',
    steps: [
      { id: 'water', title: 'Drink water', durationSeconds: 60 },
      { id: 'stretch', title: 'Stretch', durationSeconds: 120 },
    ],
  };
}

function backup(version: number, routines: unknown[], progress?: unknown): string {
  return JSON.stringify({
    format: 'routine-flow-routines',
    version,
    routines,
    ...(progress === undefined ? {} : { progress }),
  });
}

test('reads version 1 backups with legacy step durations but no history', () => {
  const old = routine();
  old.steps = [{ id: 'water', title: 'Drink water', duration: '5 minutes', durationSeconds: 0 }];
  const raw = JSON.parse(JSON.stringify(old));
  delete raw.steps[0].durationSeconds;

  assert.deepEqual(parseRoutinesFile(backup(1, [raw])), {
    routines: [{ ...old, steps: [{ ...old.steps[0], durationSeconds: 300 }] }],
  });
  assert.throws(
    () => parseRoutinesFile(backup(1, [raw], { [day]: { 'morning:water': true } })),
    /older backup cannot contain daily progress/,
  );
});

test('version 7 export and import keep completed labels and legacy booleans', () => {
  const source = routine();
  const raw = serializeRoutines([source], {
    [day]: { 'morning:water': { routineTitle: 'Original morning', stepTitle: 'Drink water' },
      'morning:stretch': true, 'other:water': true },
    'not-a-date': { 'morning:water': true },
  });
  const json = JSON.parse(raw);
  assert.equal(json.version, 7);
  assert.deepEqual(json.progress, { [day]: {
    'morning:water': { routineTitle: 'Original morning', stepTitle: 'Drink water' },
    'morning:stretch': true,
    'other:water': true,
  } });
  assert.deepEqual(parseRoutinesFile(raw), {
    routines: [source],
    skills: [],
    progress: json.progress,
  });
  assert.deepEqual(parseRoutinesFile(backup(2, [source], { [day]: { 'morning:water': false } })).progress, {
    [day]: {},
  });
});

test('version 7 backs up playlist run tags and remaps restored playlist IDs', () => {
  const source = routine();
  const taggedProgress = {
    [day]: {
      'morning:water': {
        routineTitle: 'Morning',
        stepTitle: 'Drink water',
        playlistRuns: [{ playlistId: 'old-playlist', playlistTitle: 'Morning launch' }],
      },
    },
  };
  const raw = serializeRoutines([source], taggedProgress);
  const json = JSON.parse(raw);
  assert.equal(json.version, 7);
  const imported = parseRoutinesFile(raw);
  assert.deepEqual(imported.progress, taggedProgress);
  assert.throws(
    () => parseRoutinesFile(backup(6, [source], taggedProgress)),
    /invalid step progress/,
  );

  const mappedRoutines = mergeImportedRoutines(
    [{ ...routine(), title: 'Different local routine' }],
    imported.routines,
    () => 'morning-copy',
  );
  const restored = mergeImportedProgress(
    {},
    imported.progress!,
    mappedRoutines.idMap,
    { 'old-playlist': 'local-playlist' },
  );
  assert.deepEqual(restored.progress[day]['morning-copy:water'], {
    routineTitle: 'Morning',
    stepTitle: 'Drink water',
    playlistRuns: [{ playlistId: 'local-playlist', playlistTitle: 'Morning launch' }],
  });
});

test('routine backup round-trips skill assignments and rating history', () => {
  const base = routine();
  const source: Routine = {
    ...base,
    skillIds: ['skill-focus'],
    steps: [{ ...base.steps[0], skillIds: ['skill-mobility'] }, base.steps[1]],
  };
  const skills = [{
    id: 'skill-focus',
    name: 'Focus',
    ratings: [{ id: 'rating-focus', rating: 9, ratedAt: '2030-01-01T00:00:00.000Z',
      routineTitle: 'Morning', note: 'Keep the pace steady.' }],
  }];

  const imported = parseRoutinesFile(serializeRoutines([source], undefined, skills));

  assert.deepEqual(imported.routines, [source]);
  assert.deepEqual(imported.skills, skills);
});

test('multiple step details survive backup round-trips while old single details remain valid', () => {
  const legacy = routine();
  assert.deepEqual(parseRoutinesFile(serializeRoutines([legacy])).routines, [legacy]);
  assert.deepEqual(getSpokenStepDetails(legacy.steps[0]), getStepDetails(legacy.steps[0]));

  const explicitlySpoken: Routine = {
    ...legacy,
    steps: legacy.steps.map((step) => ({ ...step, speakDetails: true })),
  };
  assert.deepEqual(getSpokenStepDetails(explicitlySpoken.steps[0]), getStepDetails(explicitlySpoken.steps[0]));
  assert.deepEqual(parseRoutinesFile(serializeRoutines([explicitlySpoken])).routines, [explicitlySpoken]);

  const withMultipleDetails: Routine = {
    ...legacy,
    steps: legacy.steps.map((step) => ({
      ...step,
      description: 'Start with the first instruction.',
      additionalDetails: ['Then follow the second instruction.', 'Finish with the last note.'],
      speakDetails: false,
    })),
  };
  assert.deepEqual(getStepDetails(withMultipleDetails.steps[0]), [
    'Start with the first instruction.',
    'Then follow the second instruction.',
    'Finish with the last note.',
  ]);
  assert.deepEqual(getSpokenStepDetails(withMultipleDetails.steps[0]), []);
  assert.deepEqual(parseRoutinesFile(serializeRoutines([withMultipleDetails])).routines, [withMultipleDetails]);

  const invalid = JSON.parse(serializeRoutines([withMultipleDetails])) as {
    routines: Array<{ steps: Array<Record<string, unknown>> }>;
  };
  invalid.routines[0].steps[0].additionalDetails = ['Valid detail', 42];
  assert.throws(() => parseRoutinesFile(JSON.stringify(invalid)), /invalid details/);

  const invalidSpeechSetting = JSON.parse(serializeRoutines([withMultipleDetails])) as {
    routines: Array<{ steps: Array<Record<string, unknown>> }>;
  };
  invalidSpeechSetting.routines[0].steps[0].speakDetails = 'no';
  assert.throws(() => parseRoutinesFile(JSON.stringify(invalidSpeechSetting)), /invalid spoken-details setting/);
});

test('routine copies preserve additional details without sharing their arrays', () => {
  const source = routine();
  source.steps[0].additionalDetails = ['Use the saved checklist.'];
  source.steps[0].speakDetails = false;
  let nextId = 0;

  const copied = makeRoutineCopy(source, [], () => `copy-${nextId++}`);

  assert.deepEqual(copied.steps[0].additionalDetails, ['Use the saved checklist.']);
  assert.notEqual(copied.steps[0].additionalDetails, source.steps[0].additionalDetails);
  assert.equal(copied.steps[0].speakDetails, false);
});

test('person backup includes playlists, schedules, selected theme, and optional daily progress', () => {
  const personData = {
    playlists: [{ id: 'focus', title: 'Focus', routineIds: ['morning'], skillIds: ['skill-focus'] }],
    schedules: [{
      id: 'morning-appointment',
      targetType: 'routine' as const,
      targetId: 'morning',
      targetTitle: 'Morning',
      scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
      reminder: false,
    }],
    selectedThemeId: 'routine-flow',
    skills: [{
      id: 'skill-focus',
      name: 'Focus',
      ratings: [{ id: 'rating-focus-1', rating: 8, ratedAt: '2030-01-02T03:04:05.000Z',
        routineTitle: 'Morning', note: 'Set a clearer intention next time.' }],
    }],
    skillRatingWindow: 7,
  };
  const progress = { [day]: { 'morning:water': true } };
  const base = routine();
  const routineWithSkills: Routine = {
    ...base,
    skillIds: ['skill-focus'],
    steps: base.steps.map((step, index) => index === 0 ? { ...step, skillIds: ['skill-mobility'] } : step),
  };

  const exported = serializePersonBackup([routineWithSkills], personData, progress);
  const imported = parseRoutinesFile(exported);

  assert.deepEqual(imported.routines, [routineWithSkills]);
  assert.deepEqual(imported.personData, {
    playlists: personData.playlists,
    schedules: personData.schedules,
    selectedThemeId: personData.selectedThemeId,
    skillRatingWindow: personData.skillRatingWindow,
  });
  assert.deepEqual(imported.skills, personData.skills);
  assert.deepEqual(imported.progress, progress);
});

test('completed removed steps survive export, import, routine ID remapping, and repeat import', () => {
  const source = routine();
  source.steps = [source.steps[0]];
  const oldCompletion = { routineTitle: 'Original morning', stepTitle: 'Stretch before breakfast' };
  const raw = serializeRoutines([source], {
    [day]: {
      'morning:water': { routineTitle: 'Original morning', stepTitle: 'Drink water' },
      'morning:stretch': oldCompletion,
      'morning:legacy': true,
      'morning:incomplete': false,
      'deleted:old-step': { routineTitle: 'Deleted', stepTitle: 'Old step' },
      'morning:bad:step': true,
    },
  });
  const imported = parseRoutinesFile(raw);
  assert.deepEqual(imported.progress, { [day]: {
    'morning:water': { routineTitle: 'Original morning', stepTitle: 'Drink water' },
    'morning:stretch': oldCompletion,
    'morning:legacy': true,
    'deleted:old-step': { routineTitle: 'Deleted', stepTitle: 'Old step' },
  } });

  const local = { ...routine(), title: 'Edited locally' };
  const mergedRoutines = mergeImportedRoutines([local], imported.routines, () => 'copy-1');
  const restored = mergeImportedProgress({}, imported.progress!, mergedRoutines.idMap);
  assert.deepEqual(restored.progress[day]['copy-1:stretch'], oldCompletion);
  assert.equal(restored.progress[day]['copy-1:legacy'], true);
  assert.deepEqual(getHistoryForDay(restored.progress, mergedRoutines.routines, day)
    .find((item) => item.id === 'copy-1')?.steps.map((step) => [step.title, step.removed]), [
    ['Drink water', false],
    ['Stretch before breakfast', true],
    ['Removed step (legacy)', true],
  ]);
  assert.deepEqual(mergeImportedProgress(restored.progress, imported.progress!, mergedRoutines.idMap), {
    progress: restored.progress, added: 0, kept: 4,
  });
});

test('version 3 and earlier reject removed step progress, but still import valid history', () => {
  const source = routine();
  source.steps = [source.steps[0]];
  for (const version of [2, 3]) {
    assert.throws(() => parseRoutinesFile(backup(version, [source], {
      [day]: { 'morning:stretch': true },
    })), /invalid step progress/);
    assert.deepEqual(parseRoutinesFile(backup(version, [source], {
      [day]: { 'morning:water': true },
    })).progress, { [day]: { 'morning:water': true } });
  }
});

test('deleted routines restore as separate History groups despite live ID and step collisions', () => {
  const labeled = { routineTitle: 'Deleted morning', stepTitle: 'Old water' };
  const imported = parseRoutinesFile(serializeRoutines([], {
    [day]: { 'morning:water': labeled, 'morning:legacy': true, 'morning:incomplete': false },
    [secondDay]: { 'legacy routine:old': true },
  }));
  const local = { ...routine(), title: 'Unrelated morning', hidden: true };
  const existing = { [day]: { 'morning:water': false } };
  const routines = mergeImportedRoutines([local], imported.routines, () => {
    throw new Error('History-only import must not create routines');
  }, existing);
  const restored = mergeImportedProgress(existing, imported.progress!, routines.idMap);
  assert.equal(routines.added, 0);
  assert.deepEqual(routines.routines, [local]);
  assert.equal(restored.added, 3);
  assert.equal(restored.progress[day]['morning:water'], false);
  assert.deepEqual(restored.progress[day]['history:morning:water'], labeled);
  assert.equal(restored.progress[day]['history:morning:legacy'], true);
  assert.deepEqual(getHistoryForDay(restored.progress, routines.routines, day), [{
    id: 'history:morning', title: 'Deleted morning', hidden: false, removed: true,
    steps: [
      { id: 'water', title: 'Old water', hidden: false, removed: true },
      { id: 'legacy', title: 'Removed step (legacy)', hidden: false, removed: true },
    ],
  }]);
  assert.equal(getHistoryForDay(restored.progress, routines.routines, secondDay)[0].title,
    'Removed routine (legacy routine)');

  assert.deepEqual(mergeImportedProgress(restored.progress, imported.progress!, routines.idMap), {
    progress: restored.progress, added: 0, kept: 3,
  });
  // Re-exporting and importing elsewhere must not nest or lose archive IDs.
  const again = parseRoutinesFile(serializeRoutines([], restored.progress));
  const elsewhere = mergeImportedProgress({}, again.progress!, {});
  assert.deepEqual(elsewhere.progress[day]['history:morning:water'], labeled);
  assert.equal(elsewhere.progress[secondDay]['history:legacy%20routine:old'], true);
  assert.equal(getHistoryForDay(elsewhere.progress, [], day)[0].removed, true);
});

test('detached IDs cannot collide with real routine IDs that resemble the history namespace', () => {
  const progress = parseRoutinesFile(serializeRoutines([], {
    [day]: { 'history:water': true, 'history%3Amorning:water': true, 'morning:water': true },
  })).progress!;
  const locals = [routine('history'), routine('history%3Amorning'), routine('morning')];
  const restored = mergeImportedProgress({}, progress, {});
  assert.equal(restored.added, 3);
  assert.deepEqual(getHistoryForDay(restored.progress, locals, day).map((group) => group.removed),
    [true, true, true]);
  assert.equal(restored.progress[day]['history:history:water'], true);
  assert.equal(restored.progress[day]['history:history%253Amorning:water'], true);
  assert.equal(restored.progress[day]['history:morning:water'], true);
  assert.throws(() => parseRoutinesFile(backup(5, [routine('history:morning')])), /required routine details/);
});

test('restoring a routine cannot take over existing history from a deleted routine', () => {
  const existing = { [day]: { 'morning:water': true } };
  const imported = routine();
  const result = mergeImportedRoutines([], [imported], () => 'copy-1', existing);
  assert.equal(result.idMap.morning, 'copy-1');
  const merged = mergeImportedProgress(existing, { [secondDay]: { 'morning:water': true } }, result.idMap);
  assert.equal(getHistoryForDay(merged.progress, result.routines, day)[0].removed, true);
  assert.equal(merged.progress[secondDay]['copy-1:water'], true);
  const again = mergeImportedRoutines(result.routines, [imported], () => {
    throw new Error('Retry should reuse the restored routine');
  }, merged.progress);
  assert.equal(again.idMap.morning, 'copy-1');
});

test('deleted history merges missing dates and steps without replacing local values', () => {
  const existing = { [day]: { 'history:morning:water': false, 'history:morning:stretch': true } };
  const incoming = {
    [day]: { 'morning:water': true, 'morning:stretch': true, 'morning:legacy': true },
    [secondDay]: { 'morning:water': true },
  };
  const result = mergeImportedProgress(existing, incoming, {});
  assert.equal(result.added, 2);
  assert.equal(result.kept, 2);
  assert.equal(result.progress[day]['history:morning:water'], false);
  assert.equal(result.progress[secondDay]['history:morning:water'], true);
  assert.deepEqual(existing[day], { 'history:morning:water': false, 'history:morning:stretch': true });
  assert.equal(mergeImportedProgress(result.progress, incoming, {}).added, 0);
});

test('version 6 validates deleted and archived history while older backups reject it', () => {
  for (const version of [2, 3, 4]) {
    assert.throws(() => parseRoutinesFile(backup(version, [], {
      [day]: { 'deleted:old': true },
    })), /invalid step progress/);
    assert.throws(() => parseRoutinesFile(backup(version, [], {
      [day]: { 'history:deleted:old': true },
    })), /invalid step progress/);
  }
  for (const key of ['deleted:', ':step', 'deleted:old:step', 'history:bad%:step',
    'history:%3A:step', 'history::step', 'history:%20:step', 'history:deleted:old:step']) {
    assert.throws(() => parseRoutinesFile(backup(5, [], { [day]: { [key]: true } })),
      /invalid step progress/, key);
  }
  for (const completion of ['true', null, [], { routineTitle: '', stepTitle: 'Old' },
    { routineTitle: 'Deleted', stepTitle: 'Old', extra: true }]) {
    assert.throws(() => parseRoutinesFile(backup(5, [], { [day]: { 'deleted:old': completion } })),
      /invalid step progress/);
  }
  assert.throws(() => parseRoutinesFile(backup(5, [], { '2026-02-30': { 'deleted:old': true } })),
    /invalid progress date/);
  assert.deepEqual(parseRoutinesFile(backup(5, [], { [day]: { 'deleted:old': false } })).progress,
    { [day]: {} });
});

test('backups preserve categories and treat a category edit as a different routine', () => {
  const categorized = { ...routine(), category: 'Health' };
  assert.deepEqual(parseRoutinesFile(serializeRoutines([categorized])).routines, [categorized]);
  assert.deepEqual(parseRoutinesFile(backup(1, [routine()])).routines, [routine()]);

  const merged = mergeImportedRoutines([routine()], [categorized], () => 'imported-health');
  assert.equal(merged.added, 1);
  assert.equal(merged.renamed, 1);
  assert.equal(merged.routines[0].category, undefined);
  assert.equal(merged.routines[1].category, 'Health');
  assert.throws(() => parseRoutinesFile(backup(2, [{ ...routine(), category: 42 }])), /invalid category/);
  assert.throws(() => parseRoutinesFile(backup(2, [{ ...routine(), category: '' }])), /invalid category/);
});

test('rejects malformed backup structure and invalid or unrelated history', () => {
  const source = routine();
  const invalidFiles = [
    '{',
    backup(8, [source]),
    backup(2, [source], []),
    backup(2, [source], { '2026-02-30': { 'morning:water': true } }),
    backup(2, [source], { [day]: [] }),
    backup(2, [source], { [day]: { 'unknown:water': true } }),
    backup(4, [source], { [day]: { 'unknown:old-step': { routineTitle: 'Unknown', stepTitle: 'Old' } } }),
    backup(4, [source], { [day]: { 'morning:old:step': true } }),
    backup(4, [source], { [day]: { 'morning:': true } }),
    backup(4, [source], { [day]: { 'morning:old-step': { routineTitle: 'Morning', stepTitle: '' } } }),
    backup(4, [source], { [day]: { 'morning:old-step': { routineTitle: 'Morning', stepTitle: 'Old', extra: true } } }),
    backup(4, [source], { '2026-02-30': { 'morning:old-step': true } }),
    backup(2, [source], { [day]: { 'morning:water': 'true' } }),
    backup(3, [source], { [day]: { 'morning:water': { routineTitle: 'Morning' } } }),
    backup(3, [source], { [day]: { 'morning:water': { routineTitle: '', stepTitle: 'Water' } } }),
    backup(2, [source, source]),
    backup(2, [{ ...source, steps: [source.steps[0], source.steps[0]] }]),
    'x'.repeat(MAX_ROUTINE_FILE_BYTES + 1),
  ];
  for (const file of invalidFiles) {
    assert.throws(() => parseRoutinesFile(file), Error, file.slice(0, 100));
  }
});

test('repairs unusable stored step times while preserving valid routines and legacy minutes', () => {
  const missingDuration = {
    ...routine('missing-duration'),
    steps: [{ id: 'untimed', title: 'Untimed step', description: 'Keep these details.' }],
  };
  const legacyDuration = {
    ...routine('legacy-duration'),
    steps: [{ id: 'legacy', title: 'Legacy step', duration: '5' }],
  };
  const original = JSON.stringify([routine(), missingDuration, legacyDuration]);

  const result = repairStoredRoutineDurations(original);
  const saved = JSON.parse(result.serialized);
  assert.equal(result.repairedSteps, 2);
  assert.deepEqual(saved[0], routine());
  assert.equal(saved[1].steps[0].durationSeconds, 60);
  assert.equal(saved[1].steps[0].description, 'Keep these details.');
  assert.equal(saved[2].steps[0].durationSeconds, 300);
  assert.deepEqual(parseRoutinesFile(backup(5, saved)).routines[1], {
    ...missingDuration,
    steps: [{ id: 'untimed', title: 'Untimed step', description: 'Keep these details.', durationSeconds: 60 }],
  });
  assert.equal(JSON.stringify([routine(), missingDuration, legacyDuration]), original);
});

test('does not repair malformed routine structure as a duration problem', () => {
  const invalid = JSON.stringify([{
    ...routine('invalid-step'),
    steps: [{ id: '', title: 'Bad step', durationSeconds: null }],
  }]);
  assert.throws(() => repairStoredRoutineDurations(invalid), /needs a valid ID and name/);
  assert.equal(JSON.parse(invalid)[0].steps[0].id, '');
});

test('restoring labeled completions remaps routine IDs but keeps original labels', () => {
  const source = routine();
  const local = { ...source, title: 'Changed locally' };
  const completion = { routineTitle: 'Earlier Morning', stepTitle: 'Earlier Water' };
  const imported = parseRoutinesFile(backup(3, [source], {
    [day]: { 'morning:water': completion },
  }));
  const merged = mergeImportedRoutines([local], imported.routines, () => 'copy-1');
  assert.deepEqual(mergeImportedProgress({}, imported.progress!, merged.idMap).progress, {
    [day]: { 'copy-1:water': completion },
  });
});

test('conflicting routine IDs create a separate copy and remap progress without changing local flags', () => {
  const original = routine();
  const customized = { ...routine(), title: 'My morning' };
  const existing: CompletionMap = {
    [day]: { 'morning:water': false, 'morning:stretch': true },
    [secondDay]: { 'morning:water': true },
  };
  const imported = parseRoutinesFile(backup(2, [original], {
    [day]: { 'morning:water': true, 'morning:stretch': true },
    [secondDay]: { 'morning:water': true },
  }));
  let nextId = 0;
  const merged = mergeImportedRoutines([customized], imported.routines, () => `copy-${++nextId}`);
  assert.deepEqual({ added: merged.added, skipped: merged.skipped, renamed: merged.renamed }, {
    added: 1, skipped: 0, renamed: 1,
  });
  assert.deepEqual(merged.routines, [customized, { ...original, id: 'copy-1' }]);
  assert.equal(merged.idMap.morning, 'copy-1');

  const result = mergeImportedProgress(existing, imported.progress!, merged.idMap);
  assert.deepEqual(result, {
    progress: {
      [day]: {
        'morning:water': false,
        'morning:stretch': true,
        'copy-1:water': true,
        'copy-1:stretch': true,
      },
      [secondDay]: { 'morning:water': true, 'copy-1:water': true },
    },
    added: 3,
    kept: 0,
  });
  assert.deepEqual(existing[day], { 'morning:water': false, 'morning:stretch': true });

  const again = mergeImportedRoutines(merged.routines, imported.routines, () => {
    throw new Error('Repeated import should not generate an ID');
  });
  assert.deepEqual({ added: again.added, skipped: again.skipped, renamed: again.renamed }, {
    added: 0, skipped: 1, renamed: 0,
  });
  assert.equal(again.idMap.morning, 'copy-1');
  assert.deepEqual(mergeImportedProgress(result.progress, imported.progress!, again.idMap), {
    progress: result.progress, added: 0, kept: 3,
  });
});

test('matching routines with different IDs reuse their local progress, including explicit false', () => {
  const original = routine('backup-id');
  const local = routine('local-id');
  const existing = { [day]: { 'local-id:water': false, 'local-id:stretch': true } };
  const merged = mergeImportedRoutines([local], [original], () => {
    throw new Error('Identical routines should not be copied');
  });
  assert.equal(merged.added, 0);
  assert.equal(merged.skipped, 1);
  assert.equal(merged.idMap['backup-id'], 'local-id');
  assert.deepEqual(mergeImportedProgress(existing, {
    [day]: { 'backup-id:water': true, 'backup-id:stretch': true },
    [secondDay]: { 'backup-id:water': false, 'backup-id:stretch': true },
  }, merged.idMap), {
    progress: {
      [day]: { 'local-id:water': false, 'local-id:stretch': true },
      [secondDay]: { 'local-id:stretch': true },
    },
    added: 1,
    kept: 2,
  });
  assert.deepEqual(existing, { [day]: { 'local-id:water': false, 'local-id:stretch': true } });
});

test('failed history save reports saved routines and retry adds progress without another routine', async () => {
  const local = { ...routine(), title: 'Customized morning' };
  const imported = routine();
  const backupProgress = { [day]: { 'morning:water': true } };
  let currentRoutines = [local];
  let currentProgress: CompletionMap = {};
  const stored = new Map<string, string>();
  let failProgress = true;
  const storage = {
    async setItem(key: string, value: string) {
      if (key === 'progress' && failProgress) throw new Error('Disk full');
      stored.set(key, value);
    },
    async getItem(key: string) { return stored.get(key) ?? null; },
  };
  let generated = 0;
  async function restore() {
    const result = mergeImportedRoutines(currentRoutines, [imported], () => `copy-${++generated}`);
    const merged = mergeImportedProgress(currentProgress, backupProgress, result.idMap);
    await persistImportedBackup(
      storage, 'routines', 'progress', result.routines, merged.progress, result.added, merged.added,
      (saved) => { currentRoutines = saved; },
      (saved) => { currentProgress = saved; },
      () => { throw new Error('Routine save is not uncertain'); },
    );
    return result;
  }

  await assert.rejects(restore(), /1 routine was saved, but daily progress could not be confirmed saved.*Try importing this backup again/);
  assert.deepEqual(JSON.parse(stored.get('routines')!), [local, { ...imported, id: 'copy-1' }]);
  assert.equal(stored.has('progress'), false);
  assert.equal(currentRoutines.length, 2);
  assert.deepEqual(currentProgress, {});

  failProgress = false;
  const retried = await restore();
  assert.equal(retried.added, 0);
  assert.equal(generated, 1);
  assert.deepEqual(currentProgress, { [day]: { 'copy-1:water': true } });
  assert.deepEqual(JSON.parse(stored.get('progress')!), currentProgress);
  assert.equal(currentRoutines.length, 2);
});

test('a routines write that commits then rejects is reconciled before retry', async () => {
  const local = { ...routine(), title: 'Customized morning' };
  const imported = routine();
  const stored = new Map<string, string>();
  let currentRoutines = [local];
  let currentProgress: CompletionMap = {};
  let generated = 0;
  let failAfterCommit = true;
  const storage = {
    async setItem(key: string, value: string) {
      stored.set(key, value);
      if (key === 'routines' && failAfterCommit) throw new Error('Write acknowledged late');
    },
    async getItem(key: string) { return stored.get(key) ?? null; },
  };
  async function restore() {
    const result = mergeImportedRoutines(currentRoutines, [imported], () => `copy-${++generated}`);
    const merged = mergeImportedProgress(currentProgress, {
      [day]: { 'morning:water': true },
    }, result.idMap);
    await persistImportedBackup(
      storage, 'routines', 'progress', result.routines, merged.progress,
      result.added, merged.added,
      (saved) => { currentRoutines = saved; },
      (saved) => { currentProgress = saved; },
      () => { throw new Error('The write was confirmed'); },
    );
    return result;
  }

  await assert.rejects(restore(), /1 routine was saved, but daily progress was not restored/);
  assert.deepEqual(JSON.parse(stored.get('routines')!), [local, { ...imported, id: 'copy-1' }]);
  assert.equal(stored.has('progress'), false);
  failAfterCommit = false;
  const retried = await restore();
  assert.equal(retried.added, 0);
  assert.equal(generated, 1);
  assert.equal(currentRoutines.length, 2);
  assert.deepEqual(currentProgress, { [day]: { 'copy-1:water': true } });
  assert.deepEqual(JSON.parse(stored.get('progress')!), currentProgress);
});

test('unconfirmed routines write prevents an unsafe retry', async () => {
  let blocked = false;
  await assert.rejects(persistImportedBackup(
    {
      async setItem() { throw new Error('Write failed'); },
      async getItem() { throw new Error('Read failed'); },
    },
    'routines', 'progress', [routine()], {}, 1, 0,
    () => { throw new Error('Unexpected saved callback'); },
    () => { throw new Error('Unexpected progress callback'); },
    () => { blocked = true; },
  ), /Restart the app before trying this backup again/);
  assert.equal(blocked, true);
});