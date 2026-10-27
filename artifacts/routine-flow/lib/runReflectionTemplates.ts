import type { Routine } from '../types/routines';
import { playablePlaylistIds, type RoutinePlaylist } from './playlists';

export type DeferredReflectionTemplateInput = {
  sourceRoutineId: string;
  sourcePlaylistId?: string;
  templateTextSnapshot?: string;
  templateHtmlSnapshot?: string;
};

export type ReflectionTemplateContent = {
  text: string;
  html: string;
};

export function getDeferredReflectionTemplate(
  reflection: DeferredReflectionTemplateInput,
  routines: Routine[],
  playlists: RoutinePlaylist[],
): ReflectionTemplateContent {
  const hasSnapshot = reflection.templateTextSnapshot !== undefined
    || reflection.templateHtmlSnapshot !== undefined;
  if (hasSnapshot) {
    return {
      text: reflection.templateTextSnapshot ?? '',
      html: reflection.templateHtmlSnapshot ?? '',
    };
  }

  const routine = routines.find(item => item.id === reflection.sourceRoutineId);
  const playlist = reflection.sourcePlaylistId
    ? playlists.find(item => item.id === reflection.sourcePlaylistId)
    : undefined;
  const playableIds = playlist ? playablePlaylistIds(playlist.routineIds, routines) : [];
  const lastRoutineId = playableIds[playableIds.length - 1];
  const playlistTemplateApplies = playlist
    && lastRoutineId === reflection.sourceRoutineId
    && !!playlist.reflectionTemplate;
  const source = playlistTemplateApplies ? playlist : routine;

  return {
    text: source?.reflectionTemplate ?? '',
    html: source?.reflectionTemplateHtml ?? '',
  };
}
