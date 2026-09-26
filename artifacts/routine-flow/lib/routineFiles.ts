import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { MAX_BACKUP_SIZE } from '@/types/routineBackup';

export async function downloadRoutineBackup(content: string): Promise<void> {
  const filename = `routine-flow-backup-${new Date().toISOString().slice(0, 10)}.json`;
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Saving files is not available on this device.');
  }
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(content);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: 'Save routine backup',
  });
}

export async function selectRoutineBackup(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
    multiple: false,
    base64: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) throw new Error('No file was selected.');
  if (asset.size && asset.size > MAX_BACKUP_SIZE) {
    throw new Error('Backup is too large (10 MB maximum).');
  }
  if (Platform.OS === 'web') {
    return asset.file ? asset.file.text() : (await fetch(asset.uri)).text();
  }
  return new File(asset.uri).text();
}