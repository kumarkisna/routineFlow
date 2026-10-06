import { usePersonStorage } from '@/context/PeopleContext';
import { usePlaylists } from '@/context/PlaylistContext';
import { useRoutines } from '@/context/RoutineContext';
import { useSchedules } from '@/context/ScheduleContext';
import { createRoutineWriteGuard } from '@/lib/routineWriteGuard';
import {
  DEFAULT_SKILL_RATING_WINDOW,
  MAX_SKILLS,
  MAX_SKILL_RATING_WINDOW,
  MIN_SKILL_RATING_WINDOW,
  mergeSkillCatalog,
  normalizeSkillName,
  parseSkillRatingWindow,
  parseSkills,
  removeSkillFromCatalog,
  validateSkillName,
  MAX_SKILL_NOTE_LENGTH,
  type RoutineSkill,
  type SkillRatingRun,
} from '@/lib/skills';
import { PERSON_DATA_KEYS } from '@/lib/personStorage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

type SkillContextValue = {
  skills: RoutineSkill[];
  ratingWindow: number;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  createSkill: (name: string) => Promise<RoutineSkill>;
  updateSkill: (id: string, name: string) => Promise<void>;
  deleteSkill: (id: string) => Promise<void>;
  setRatingWindow: (value: number) => Promise<void>;
  recordRatings: (
    routineTitle: string,
    ratings: { skillId: string; rating: number; note?: string; sequence: number }[],
    run: SkillRatingRun,
  ) => Promise<void>;
  mergeImportedSkills: (skills: RoutineSkill[]) => Promise<Record<string, string>>;
};

const SkillContext = createContext<SkillContextValue | null>(null);
const KEY = PERSON_DATA_KEYS.skills;
const RATING_WINDOW_KEY = PERSON_DATA_KEYS.skillRatingWindow;

function makeId() {
  return `skill-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function SkillProvider({ children }: { children: React.ReactNode }) {
  const storage = usePersonStorage();
  const { removeSkillAssignments: removeRoutineAssignments } = useRoutines();
  const { removeSkillAssignments: removePlaylistAssignments } = usePlaylists();
  const { removeSkillAssignments: removeScheduleAssignments } = useSchedules();
  const [skills, setSkills] = useState<RoutineSkill[]>([]);
  const [ratingWindow, setRatingWindowState] = useState(DEFAULT_SKILL_RATING_WINDOW);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const current = useRef<RoutineSkill[]>([]);
  const runWrite = useRef(createRoutineWriteGuard()).current;

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [stored, storedWindow] = await Promise.all([
        storage.getItem(KEY),
        storage.getItem(RATING_WINDOW_KEY),
      ]);
      const next = stored === null ? [] : parseSkills(stored);
      const nextWindow = parseSkillRatingWindow(storedWindow);
      current.current = next;
      setSkills(next);
      setRatingWindowState(nextWindow);
    } catch {
      setError('Your skills could not load. Retry before making changes.');
    } finally {
      setLoading(false);
    }
  }, [storage]);

  useEffect(() => { void reload(); }, [reload]);

  const createSkill = useCallback((name: string) => runWrite(async () => {
    if (loading || error) throw new Error('Wait for skills to load successfully before making changes.');
    if (current.current.length >= MAX_SKILLS) throw new Error(`You can save up to ${MAX_SKILLS} skills.`);
    const normalized = validateSkillName(name, current.current);
    const skill: RoutineSkill = { id: makeId(), name: normalized };
    const next = [...current.current, skill];
    await storage.setItem(KEY, JSON.stringify(next));
    current.current = next;
    setSkills(next);
    return skill;
  }), [error, loading, runWrite, storage]);

  const updateSkill = useCallback((id: string, name: string) => runWrite(async () => {
    if (loading || error) throw new Error('Wait for skills to load successfully before making changes.');
    const existing = current.current.find(skill => skill.id === id);
    if (!existing) throw new Error('Skill not found.');
    const normalized = validateSkillName(name, current.current, id);
    const next = current.current.map(skill => skill.id === id ? { ...skill, name: normalized } : skill);
    await storage.setItem(KEY, JSON.stringify(next));
    current.current = next;
    setSkills(next);
  }), [error, loading, runWrite, storage]);

  const setRatingWindow = useCallback((value: number) => runWrite(async () => {
    if (loading || error) throw new Error('Wait for skills to load successfully before changing this setting.');
    if (!Number.isInteger(value) || value < MIN_SKILL_RATING_WINDOW || value > MAX_SKILL_RATING_WINDOW) {
      throw new Error(`Choose a whole number from ${MIN_SKILL_RATING_WINDOW} to ${MAX_SKILL_RATING_WINDOW}.`);
    }
    await storage.setItem(RATING_WINDOW_KEY, String(value));
    setRatingWindowState(value);
  }), [error, loading, runWrite, storage]);

  const recordRatings = useCallback((routineTitle: string, entries: {
    skillId: string; rating: number; note?: string; sequence: number;
  }[], run: SkillRatingRun) =>
    runWrite(async () => {
      if (loading || error) throw new Error('Wait for skills to load successfully before saving ratings.');
      const title = routineTitle.trim();
      if (!title || title.length > 200) throw new Error('The completed routine name is invalid.');
      if (!Array.isArray(entries) || entries.some(entry =>
        !entry || typeof entry.skillId !== 'string'
       || !Number.isInteger(entry.rating) || entry.rating < 1 || entry.rating > 10
       || (entry.note !== undefined
         && (typeof entry.note !== 'string' || entry.note.length > MAX_SKILL_NOTE_LENGTH)))
        || new Set(entries.map(entry => entry.skillId)).size !== entries.length) {
        throw new Error('Choose a rating from 1 to 10 and a valid note for each selected skill.');
      }
      if (entries.some(entry => !current.current.some(skill => skill.id === entry.skillId))) {
        throw new Error('One or more skills were removed. Refresh the skill list and try again.');
      }
      if (!entries.length) return;
      if (!run || typeof run.runId !== 'string' || !run.runId.trim() || run.runId.length > 160
        || typeof run.completedAt !== 'string' || !Number.isFinite(Date.parse(run.completedAt))) {
        throw new Error('The routine completion time could not be verified. Please retry the rating.');
      }
      if (entries.some(entry => !Number.isInteger(entry.sequence) || entry.sequence < 0 || entry.sequence > 999)
        || new Set(entries.map(entry => entry.sequence)).size !== entries.length) {
        throw new Error('The skill order could not be verified. Please retry the rating.');
      }
      const ratedAt = new Date().toISOString();
      const ratingsBySkill = new Map(entries.map(entry => [entry.skillId, entry]));
      const next = current.current.map(skill => {
        const entry = ratingsBySkill.get(skill.id);
        if (entry === undefined) return skill;
        const note = entry.note?.trim();
        const ratings = [...(skill.ratings ?? []), {
          id: `rating-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          rating: entry.rating,
          ratedAt,
          routineTitle: title,
          runId: run.runId,
          completedAt: run.completedAt,
          sequence: entry.sequence,
          ...(note ? { note } : {}),
        }];
        if (ratings.length > 20_000) throw new Error('This skill has reached its saved rating limit.');
        return { ...skill, ratings };
      });
      await storage.setItem(KEY, JSON.stringify(next));
      current.current = next;
      setSkills(next);
    }), [error, loading, runWrite, storage]);

  const deleteSkill = useCallback((id: string) => runWrite(async () => {
    if (loading || error) throw new Error('Wait for skills to load successfully before making changes.');
    if (!current.current.some(skill => skill.id === id)) throw new Error('Skill not found.');
    // Keep the skill definition if any cleanup fails; retrying is safe and idempotent.
    await Promise.all([
      removeRoutineAssignments(id),
      removePlaylistAssignments(id),
      removeScheduleAssignments(id),
    ]);
    const next = removeSkillFromCatalog(current.current, id);
    await storage.setItem(KEY, JSON.stringify(next));
    current.current = next;
    setSkills(next);
  }), [
    error, loading, removePlaylistAssignments, removeRoutineAssignments, removeScheduleAssignments, runWrite, storage,
  ]);

  const mergeImportedSkills = useCallback((imported: RoutineSkill[]) => runWrite(async () => {
    if (loading || error) throw new Error('Wait for skills to load successfully before importing.');
    const normalized = imported.map(skill => ({ ...skill, name: normalizeSkillName(skill.name) }));
    const { skills: next, idMap } = mergeSkillCatalog(current.current, normalized);
    if (JSON.stringify(next) !== JSON.stringify(current.current)) {
      await storage.setItem(KEY, JSON.stringify(next));
      current.current = next;
      setSkills(next);
    }
    return idMap;
  }), [error, loading, runWrite, storage]);

  return (
    <SkillContext.Provider value={{
      skills, ratingWindow, loading, error, reload, createSkill, updateSkill, deleteSkill,
      setRatingWindow, recordRatings, mergeImportedSkills,
    }}>
      {children}
    </SkillContext.Provider>
  );
}

export function useSkills() {
  const context = useContext(SkillContext);
  if (!context) throw new Error('useSkills must be used within SkillProvider');
  return context;
}
