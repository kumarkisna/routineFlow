import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';

/** Per-item disclosure state, expanded by default and retained across app restarts. */
export function usePersistentDisclosure(namespace: string, ownerId: string, defaultExpanded = true) {
  const storageKey = `routine-flow:disclosure:v1:${namespace}:${ownerId}`;
  const [collapsed, setCollapsed] = React.useState<Record<string, true>>({});
  const current = React.useRef<Record<string, true>>({});
  const pending = React.useRef<Record<string, true | false>>({});
  const hydrated = React.useRef(false);
  const writeQueue = React.useRef<Promise<void>>(Promise.resolve());

  React.useEffect(() => {
    let active = true;
    hydrated.current = false;
    current.current = {};
    pending.current = {};
    setCollapsed({});
    void AsyncStorage.getItem(storageKey).then(raw => {
      if (!active) return;
      let saved: Record<string, true> = {};
      try {
        const parsed: unknown = raw ? JSON.parse(raw) : {};
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          saved = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, true] => entry[1] === true));
        }
      } catch {
        console.warn(`Could not read saved ${namespace} disclosure preferences.`);
      }
      const merged = { ...saved };
      for (const [id, isCollapsed] of Object.entries(pending.current)) {
        if (isCollapsed) merged[id] = true;
        else delete merged[id];
      }
      current.current = merged;
      hydrated.current = true;
      setCollapsed(merged);
      if (Object.keys(pending.current).length) persist(merged);
      pending.current = {};
    }).catch(error => {
      if (active) {
        console.warn(`Could not load ${namespace} disclosure preferences.`, error);
        hydrated.current = true;
        if (Object.keys(pending.current).length) persist(current.current);
        pending.current = {};
      }
    });
    return () => { active = false; };
  }, [storageKey, namespace]);

  const persist = (next: Record<string, true>) => {
    writeQueue.current = writeQueue.current.then(() => AsyncStorage.setItem(storageKey, JSON.stringify(next)))
      .catch(error => console.warn(`Could not save ${namespace} disclosure preferences.`, error));
  };

  const toggle = React.useCallback((id: string) => {
    const next = { ...current.current };
    const isCurrentlyExpanded = next[id] === true ? !defaultExpanded : defaultExpanded;
    if (isCurrentlyExpanded === defaultExpanded) next[id] = true;
    else delete next[id];
    current.current = next;
    setCollapsed(next);
    if (hydrated.current) persist(next);
    else pending.current[id] = isCurrentlyExpanded === defaultExpanded;
  }, [storageKey, namespace, defaultExpanded]);

  const isExpanded = React.useCallback((id: string) => collapsed[id] === true ? !defaultExpanded : defaultExpanded,
    [collapsed, defaultExpanded]);
  return { isExpanded, toggle };
}
