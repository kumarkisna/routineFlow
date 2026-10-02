import { useAppearance } from '@/context/AppearanceContext';

/** Every screen uses the user's saved app-wide theme. */
export function useColors() {
  return useAppearance().theme.colors;
}
