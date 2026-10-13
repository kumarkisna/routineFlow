import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import React, { useState } from 'react';
import { Alert, Image, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { StepDetailAttachment } from '@/types/routines';

function getImageFileName(asset: Pick<ImagePicker.ImagePickerAsset, 'fileName' | 'uri' | 'mimeType'>, fallbackLabel: string) {
  const selectedName = asset.fileName?.trim();
  if (selectedName) return selectedName;
  const uriName = decodeURIComponent(asset.uri.split(/[/?#]/).pop() ?? '');
  if (uriName && /\.[a-z0-9]{2,8}$/i.test(uriName)) return uriName;
  const mimeExtension = asset.mimeType?.split('/')[1]?.replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg';
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(/:/g, '-');
  return `${fallbackLabel}-${stamp}.${mimeExtension}`;
}

export function StepDetailAttachments({
  attachments, onChange, onAddAttachment, onRemoveAttachment, disabled = false, testID = 'step-detail-attachments', label = 'Attachments',
}: {
  attachments: StepDetailAttachment[];
  onChange?: (attachments: StepDetailAttachment[]) => void;
  onAddAttachment?: (attachment: StepDetailAttachment) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
  disabled?: boolean;
  testID?: string;
  label?: string;
}) {
  const colors = useColors();
  const [viewing, setViewing] = useState<StepDetailAttachment | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveCopy(uri: string, name: string, mimeType: string, kind: StepDetailAttachment['kind']) {
    if (!FileSystem.documentDirectory) throw new Error('App file storage is unavailable.');
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && info.size && info.size > 2_000_000) throw new Error('Choose a file smaller than 2 MB.');
    const id = `detail-file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const directory = `${FileSystem.documentDirectory}step-detail-attachments/`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const extension = name.includes('.') ? name.split('.').pop()!.replace(/[^a-z0-9]/gi, '').slice(0, 8) : '';
    const destination = `${directory}${id}${extension ? `.${extension}` : ''}`;
    await FileSystem.copyAsync({ from: uri, to: destination });
    const contentBase64 = await FileSystem.readAsStringAsync(destination, { encoding: FileSystem.EncodingType.Base64 });
    return { id, name: name.slice(0, 240), uri: destination, mimeType: mimeType || 'application/octet-stream', kind, contentBase64 };
  }

  async function addImage() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (result.canceled) return;
      setBusy(true);
      const asset = result.assets[0];
      const file = await saveCopy(asset.uri, getImageFileName(asset, 'Image'), asset.mimeType || 'image/jpeg', 'image');
      if (onAddAttachment) onAddAttachment(file);
      else onChange?.([...attachments, file]);
    } catch (error) {
      Alert.alert('Could not attach image', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function takePhoto() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera access needed', 'Allow camera access in system settings to take a photo for this step.', [
          { text: 'Not now', style: 'cancel' },
          ...(!permission.canAskAgain ? [{ text: 'Open Settings', onPress: () => void Linking.openSettings() }] : []),
        ]);
        return;
      }
      setBusy(true);
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      const file = await saveCopy(asset.uri, getImageFileName(asset, 'Photo'), asset.mimeType || 'image/jpeg', 'image');
      if (onAddAttachment) onAddAttachment(file);
      else onChange?.([...attachments, file]);
    } catch (error) {
      Alert.alert('Could not take photo', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function addDocument() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      setBusy(true);
      const asset = result.assets[0];
      const file = await saveCopy(asset.uri, asset.name, asset.mimeType || 'application/octet-stream', 'document');
      if (onAddAttachment) onAddAttachment(file);
      else onChange?.([...attachments, file]);
    } catch (error) {
      Alert.alert('Could not attach document', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function openDocument(file: StepDetailAttachment) {
    try {
      if (!await Sharing.isAvailableAsync()) throw new Error('No app-sharing option is available on this device.');
      let uri = file.uri;
      if (!uri || !(await FileSystem.getInfoAsync(uri)).exists) {
        if (!FileSystem.cacheDirectory) throw new Error('Temporary file storage is unavailable.');
        uri = `${FileSystem.cacheDirectory}${file.id}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        await FileSystem.writeAsStringAsync(uri, file.contentBase64, { encoding: FileSystem.EncodingType.Base64 });
      }
      await Sharing.shareAsync(uri, { mimeType: file.mimeType, dialogTitle: `Open ${file.name}` });
    } catch (error) {
      Alert.alert('Could not open document', error instanceof Error ? error.message : 'Try again.');
    }
  }

  async function remove(file: StepDetailAttachment) {
    try { if (file.uri) await FileSystem.deleteAsync(file.uri, { idempotent: true }); } catch { /* Removing a stale file is safe. */ }
    if (onRemoveAttachment) onRemoveAttachment(file.id);
    else onChange?.(attachments.filter(item => item.id !== file.id));
  }

  return (
    <View testID={testID} style={styles.container}>
      {attachments.length ? <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>{label}</Text> : null}
      {attachments.map(file => (
        <View key={file.id} style={[styles.fileRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={file.kind === 'image' ? `View image ${file.name}` : `Open ${file.name} in another app`}
            onPress={() => file.kind === 'image' ? setViewing(file) : void openDocument(file)} style={styles.fileButton}>
            {file.kind === 'image' ? <Image source={{ uri: `data:${file.mimeType};base64,${file.contentBase64}` }} style={styles.thumbnail} /> :
              <Ionicons name="document-text-outline" size={22} color={colors.primary} />}
            <Text numberOfLines={1} style={[styles.fileName, { color: colors.foreground }]}>{file.name}</Text>
          </Pressable>
          {onChange || onRemoveAttachment ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${file.name}`} disabled={disabled || busy}
            onPress={() => void remove(file)} style={styles.remove}>
            <Ionicons name="close-circle-outline" size={20} color={colors.destructive} />
          </Pressable> : null}
        </View>
      ))}
      {onChange || onAddAttachment ? (
        <View style={styles.actions}>
          {Platform.OS !== 'web' ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Take a photo" testID={`${testID}-take-photo`} disabled={disabled || busy}
              onPress={() => void takePhoto()} style={[styles.addButton, { borderColor: colors.border }]}>
              <Ionicons name="camera-outline" size={16} color={colors.primary} /><Text style={[styles.addText, { color: colors.primary }]}>Camera</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Attach an image" testID={`${testID}-add-image`} disabled={disabled || busy}
            onPress={() => void addImage()} style={[styles.addButton, { borderColor: colors.border }]}>
            <Ionicons name="image-outline" size={16} color={colors.primary} /><Text style={[styles.addText, { color: colors.primary }]}>Image</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Attach a document" testID={`${testID}-add-document`} disabled={disabled || busy}
            onPress={() => void addDocument()} style={[styles.addButton, { borderColor: colors.border }]}>
            <Ionicons name="document-attach-outline" size={16} color={colors.primary} /><Text style={[styles.addText, { color: colors.primary }]}>Document</Text>
          </Pressable>
        </View>
      ) : null}
      <Modal visible={viewing !== null} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={styles.viewer}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close image" onPress={() => setViewing(null)} style={styles.close}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          {viewing ? <Image accessibilityLabel={viewing.name} source={{ uri: `data:${viewing.mimeType};base64,${viewing.contentBase64}` }} resizeMode="contain" style={styles.fullImage} /> : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  groupLabel: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 3 },
  actions: { flexDirection: 'row', gap: 8 },
  addButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 10, paddingHorizontal: 9 },
  addText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  fileRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, padding: 5, gap: 6 },
  fileButton: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  thumbnail: { width: 34, height: 34, borderRadius: 6 },
  fileName: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12 },
  remove: { width: 32, height: 34, alignItems: 'center', justifyContent: 'center' },
  viewer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  fullImage: { width: '100%', height: '85%' },
  close: { position: 'absolute', top: 48, right: 20, zIndex: 2, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
