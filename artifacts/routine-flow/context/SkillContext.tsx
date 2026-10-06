import { usePersonStorage } from '@/context/PeopleContext';
import { usePlaylists } from '@/context/PlaylistContext';
import { useRoutines } from '@/context/RoutineContext';
import { useSchedules } from '@/context/ScheduleContext';
import { createRoutineWriteGuard } from '@/lib/routineWriteGuard';
import {
  MAX_SKILLS,
  mergeSkillCatalog,
  normalizeSkillName,
  parseSkills,
  validateSkillName,
  type RoutineSkill,
} from '@/lib/skills';
import { PERSON_DATA_KEYS } from '@/lib/personStorage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

type SkillContextValue = {
  skills: RoutineSkill[];
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  createSkill: (name: string) => Promise<RoutineSkill>;
  updateSkill: (id: string, name: string) => Promise<void>;
  deleteSkill: (id: string) => Promise<void>;
  mergeImportedSkills: (skills: RoutineSkill[]) => Promise<Record<string, string>>;
};

const SkillContext = createContext<SkillContextValue | null>(null);
const KEY = PERSON_DATA_KEYS.skills;

function makeId() {
  return `skill-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function SkillProvider({ children }: { children: React.ReactNode }) {
  const storage = usePersonStorage();
  const { removeSkillAssignments: removeRoutineAssignments } = useRoutines();
  const { removeSkillAssignments: removePlaylistAssignments } = usePlaylists();
  const { removeSkillAssignments: removeScheduleAssignments } = useSchedules();
  const [skills, setSkills] = useState<RoutineSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const current = useRef<RoutineSkill[]>([]);
  const runWrite = useRef(createRoutineWriteGuard()).current;

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const stored = await storage.getItem(KEY);
      const next = stored === null ? [] : parseSkills(stored);
      current.current = next;
      setSkills(next);
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

  const deleteSkill = useCallback((id: string) => runWrite(async () => {
    if (loading || error) throw new Error('Wait for skills to load successfully before making changes.');
    if (!current.current.some(skill => skill.id === id)) throw new Error('Skill not found.');
    // Keep the skill definition if any cleanup fails; retrying is safe and idempotent.
    await Promise.all([
      removeRoutineAssignments(id),
      removePlaylistAssignments(id),
      removeScheduleAssignments(id),
    ]);
    const next = current.current.filter(skill => skill.id !== id);
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
    <SkillContext.Provider value={{ skills, loading, error, reload, createSkill, updateSkill, deleteSkill, mergeImportedSkills }}>
      {children}
    </SkillContext.Provider>
  );
}

export function useSkills() {
  const context = useContext(SkillContext);
  if (!context) throw new Error('useSkills must be used within SkillProvider');
  return context;
}
