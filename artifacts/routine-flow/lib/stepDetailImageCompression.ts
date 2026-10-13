export type ResizeAction = { resize: { width?: number; height?: number } };

type ImageCompressionPreset = {
  maxDimension: number;
  quality: number;
};

type ImageCompressionResult = {
  uri: string;
  width: number;
  height: number;
  size: number;
};

const COMPRESSION_PRESETS: ImageCompressionPreset[] = [
  { maxDimension: 3072, quality: 0.84 },
  { maxDimension: 2560, quality: 0.8 },
  { maxDimension: 2304, quality: 0.76 },
  { maxDimension: 2048, quality: 0.73 },
  { maxDimension: 1920, quality: 0.7 },
  { maxDimension: 1792, quality: 0.67 },
  { maxDimension: 1600, quality: 0.64 },
  { maxDimension: 1440, quality: 0.6 },
  { maxDimension: 1280, quality: 0.56 },
  { maxDimension: 1024, quality: 0.5 },
];

export async function compressImageToSize(
  input: { uri: string; width: number; height: number; maxBytes: number },
  dependencies: {
    manipulate: (uri: string, actions: ResizeAction[], quality: number) => Promise<{ uri: string; width: number; height: number }>;
    getFileSize: (uri: string) => Promise<number>;
    deleteTemporaryFile: (uri: string) => Promise<void>;
  },
): Promise<ImageCompressionResult> {
  const longestSide = Math.max(input.width, input.height);

  for (const preset of COMPRESSION_PRESETS) {
    let actions: ResizeAction[] = [];
    if (longestSide > preset.maxDimension) {
      const scale = preset.maxDimension / longestSide;
      const width = Math.max(1, Math.round(input.width * scale));
      const height = Math.max(1, Math.round(input.height * scale));
      actions = [{ resize: input.width >= input.height ? { width } : { height } }];
    }

    const result = await dependencies.manipulate(input.uri, actions, preset.quality);
    let size: number;
    try {
      size = await dependencies.getFileSize(result.uri);
    } catch (error) {
      if (result.uri !== input.uri) await dependencies.deleteTemporaryFile(result.uri).catch(() => {});
      throw error;
    }

    if (size <= input.maxBytes) return { ...result, size };
    if (result.uri !== input.uri) await dependencies.deleteTemporaryFile(result.uri).catch(() => {});
  }

  throw new Error('This image is still larger than 2 MB after compression. Choose a smaller image.');
}
