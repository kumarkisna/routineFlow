import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { STEP_DETAIL_ATTACHMENT_MAX_BYTES, STEP_DETAIL_ATTACHMENT_MAX_COUNT, type StepDetailAttachment } from '@/types/routines';
import { compressImageToSize } from '@/lib/stepDetailImageCompression';

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
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const viewerRef = useRef<ScrollView>(null);
  const viewportWidth = useWindowDimensions().width;
  const images = attachments.filter(file => file.kind === 'image');
  useEffect(() => {
    if (viewingIndex !== null && images.length) {
      viewerRef.current?.scrollTo({ x: viewingIndex * viewportWidth, animated: false });
    }
  }, [viewingIndex, viewportWidth, images.length]);

  function openImage(file: StepDetailAttachment) {
    const index = images.findIndex(image => image.id === file.id);
    if (index >= 0) setViewingIndex(index);
  }

  async function saveCopy(
    uri: string,
    name: string,
    mimeType: string,
    kind: StepDetailAttachment['kind'],
    dimensions?: { width: number; height: number },
  ) {
    if (!FileSystem.documentDirectory) throw new Error('App file storage is unavailable.');
    const info = await FileSystem.getInfoAsync(uri);
    let sourceUri = uri;
    let savedName = name;
    let savedMimeType = mimeType || 'application/octet-stream';
    if (info.exists && typeof info.size === 'number' && info.size > STEP_DETAIL_ATTACHMENT_MAX_BYTES) {
      if (kind !== 'image') throw new Error('This file is larger than the 2 MB limit. Choose a smaller document.');
      if (!dimensions) throw new Error('Could not read the image dimensions. Choose another image.');
      const compressed = await compressImageToSize(
        { uri, ...dimensions, maxBytes: STEP_DETAIL_ATTACHMENT_MAX_BYTES },
        {
          manipulate: (source, actions, quality) => manipulateAsync(source, actions, {
            compress: quality,
            format: SaveFormat.JPEG,
          }),
          getFileSize: async compressedUri => {
            const compressedInfo = await FileSystem.getInfoAsync(compressedUri);
            if (!compressedInfo.exists || typeof compressedInfo.size !== 'number') {
              throw new Error('Could not verify the compressed image size.');
            }
            return compressedInfo.size;
          },
          deleteTemporaryFile: temporaryUri => FileSystem.deleteAsync(temporaryUri, { idempotent: true }),
        },
      );
      sourceUri = compressed.uri;
      savedName = `${name.replace(/\.[^/.]+$/, '') || 'image'}.jpg`;
      savedMimeType = 'image/jpeg';
    }

    const id = `detail-file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const directory = `${FileSystem.documentDirectory}step-detail-attachments/`;
    const extension = savedName.includes('.') ? savedName.split('.').pop()!.replace(/[^a-z0-9]/gi, '').slice(0, 8) : '';
    const destination = `${directory}${id}${extension ? `.${extension}` : ''}`;
    let saved = false;
    try {
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      await FileSystem.copyAsync({ from: sourceUri, to: destination });
      const contentBase64 = await FileSystem.readAsStringAsync(destination, { encoding: FileSystem.EncodingType.Base64 });
      saved = true;
      return {
        id,
        name: savedName.slice(0, 240),
        uri: destination,
        mimeType: savedMimeType,
        kind,
        contentBase64,
      };
    } catch (error) {
      if (!saved) await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => {});
      throw error;
    } finally {
      if (sourceUri !== uri) await FileSystem.deleteAsync(sourceUri, { idempotent: true }).catch(() => {});
    }
  }

  async function addImage() {
    const remaining = STEP_DETAIL_ATTACHMENT_MAX_COUNT - attachments.length;
    if (remaining <= 0) {
      Alert.alert('Attachment limit reached', `You can attach up to ${STEP_DETAIL_ATTACHMENT_MAX_COUNT} files to this detail.`);
      return;
    }
    const added: StepDetailAttachment[] = [];
    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
      });
      if (result.canceled) return;
      for (const asset of result.assets.slice(0, remaining)) {
        added.push(await saveCopy(
          asset.uri,
          getImageFileName(asset, 'Image'),
          asset.mimeType || 'image/jpeg',
          'image',
          { width: asset.width, height: asset.height },
        ));
      }
    } catch (error) {
      Alert.alert('Could not attach image', error instanceof Error ? error.message : 'Try again.');
    } finally {
      if (added.length) {
        if (onAddAttachment) added.forEach(onAddAttachment);
        else onChange?.([...attachments, ...added]);
      }
      setBusy(false);
    }
  }

  async function takePhoto() {
    if (attachments.length >= STEP_DETAIL_ATTACHMENT_MAX_COUNT) {
      Alert.alert('Attachment limit reached', `You can attach up to ${STEP_DETAIL_ATTACHMENT_MAX_COUNT} files to this detail.`);
      return;
    }
    try {
      setBusy(true);
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera access needed', 'Allow camera access in system settings to take a photo for this step.', [
          { text: 'Not now', style: 'cancel' },
          ...(!permission.canAskAgain ? [{ text: 'Open Settings', onPress: () => void Linking.openSettings() }] : []),
        ]);
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      const file = await saveCopy(
        asset.uri,
        getImageFileName(asset, 'Photo'),
        asset.mimeType || 'image/jpeg',
        'image',
        { width: asset.width, height: asset.height },
      );
      if (onAddAttachment) onAddAttachment(file);
      else onChange?.([...attachments, file]);
    } catch (error) {
      Alert.alert('Could not take photo', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function addDocument() {
    const remaining = STEP_DETAIL_ATTACHMENT_MAX_COUNT - attachments.length;
    if (remaining <= 0) {
      Alert.alert('Attachment limit reached', `You can attach up to ${STEP_DETAIL_ATTACHMENT_MAX_COUNT} files to this detail.`);
      return;
    }
    const added: StepDetailAttachment[] = [];
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled) return;
      for (const asset of result.assets.slice(0, remaining)) {
        added.push(await saveCopy(asset.uri, asset.name, asset.mimeType || 'application/octet-stream', 'document'));
      }
    } catch (error) {
      Alert.alert('Could not attach document', error instanceof Error ? error.message : 'Try again.');
    } finally {
      if (added.length) {
        if (onAddAttachment) added.forEach(onAddAttachment);
        else onChange?.([...attachments, ...added]);
      }
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
    if (onRemoveAttachment) onRemoveAttachment(file.id);
    else onChange?.(attachments.filter(item => item.id !== file.id));
  }

  return (
    <View testID={testID} style={styles.container}>
      {attachments.length ? <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>{label}</Text> : null}
      {attachments.map(file => (
        <View key={file.id} style={[styles.fileRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={file.kind === 'image' ? `View image ${file.name}` : `Open ${file.name} in another app`}
            onPress={() => file.kind === 'image' ? openImage(file) : void openDocument(file)} style={styles.fileButton}>
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
      {images.length > 1 ? (
        <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>Tap any image to swipe through this detail’s {images.length} images.</Text>
      ) : null}
      {onChange || onAddAttachment ? (
        <View style={styles.actions}>
          {Platform.OS !== 'web' ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Take a photo" testID={`${testID}-take-photo`} disabled={disabled || busy || attachments.length >= STEP_DETAIL_ATTACHMENT_MAX_COUNT}
              onPress={() => void takePhoto()} style={[styles.addButton, { borderColor: colors.border }]}>
              <Ionicons name="camera-outline" size={16} color={colors.primary} /><Text style={[styles.addText, { color: colors.primary }]}>Camera</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Attach images" testID={`${testID}-add-image`} disabled={disabled || busy || attachments.length >= STEP_DETAIL_ATTACHMENT_MAX_COUNT}
            onPress={() => void addImage()} style={[styles.addButton, { borderColor: colors.border }]}>
            <Ionicons name="image-outline" size={16} color={colors.primary} /><Text style={[styles.addText, { color: colors.primary }]}>Images</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Attach documents" testID={`${testID}-add-document`} disabled={disabled || busy || attachments.length >= STEP_DETAIL_ATTACHMENT_MAX_COUNT}
            onPress={() => void addDocument()} style={[styles.addButton, { borderColor: colors.border }]}>
            <Ionicons name="document-attach-outline" size={16} color={colors.primary} /><Text style={[styles.addText, { color: colors.primary }]}>Documents</Text>
          </Pressable>
        </View>
      ) : null}
      <Modal visible={viewingIndex !== null} transparent animationType="fade" onRequestClose={() => setViewingIndex(null)}>
        <View style={styles.viewer}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close image viewer" onPress={() => setViewingIndex(null)} style={styles.close}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          {viewingIndex !== null && images.length ? (
            <>
              <ScrollView
                ref={viewerRef}
                testID="step-detail-image-slideshow"
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                contentOffset={{ x: viewingIndex * viewportWidth, y: 0 }}
                onMomentumScrollEnd={event => {
                  const index = Math.round(event.nativeEvent.contentOffset.x / Math.max(viewportWidth, 1));
                  setViewingIndex(Math.max(0, Math.min(images.length - 1, index)));
                }}
                style={styles.slides}
              >
                {images.map(image => (
                  <View key={image.id} style={[styles.slide, { width: viewportWidth }]}>
                    <Image accessibilityLabel={image.name}
                      source={{ uri: `data:${image.mimeType};base64,${image.contentBase64}` }}
                      resizeMode="contain" style={styles.fullImage} />
                  </View>
                ))}
              </ScrollView>
              {viewingIndex > 0 ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Previous image"
                  onPress={() => setViewingIndex(index => Math.max(0, (index ?? 0) - 1))}
                  style={[styles.navButton, styles.previous]}>
                  <Ionicons name="chevron-back" size={25} color="#fff" />
                </Pressable>
              ) : null}
              {viewingIndex < images.length - 1 ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Next image"
                  onPress={() => setViewingIndex(index => Math.min(images.length - 1, (index ?? 0) + 1))}
                  style={[styles.navButton, styles.next]}>
                  <Ionicons name="chevron-forward" size={25} color="#fff" />
                </Pressable>
              ) : null}
              <Text accessibilityLiveRegion="polite" style={styles.counter}>{viewingIndex + 1} / {images.length}</Text>
            </>
          ) : null}
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
  slides: { flex: 1, width: '100%' },
  slide: { height: '100%', alignItems: 'center', justifyContent: 'center' },
  navButton: { position: 'absolute', top: '50%', marginTop: -22, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  previous: { left: 12 },
  next: { right: 12 },
  counter: { position: 'absolute', top: 52, alignSelf: 'center', color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  close: { position: 'absolute', top: 48, right: 20, zIndex: 2, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
