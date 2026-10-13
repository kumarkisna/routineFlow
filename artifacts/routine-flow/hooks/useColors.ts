import { useAppearance } from '@/context/AppearanceContext';

/** Every screen uses the user's saved app-wide theme. */
export function useColors() {
  const { theme, backgroundImage } = useAppearance();
  return backgroundImage ? { ...theme.colors, background: 'transparent' } : theme.colors;
}
