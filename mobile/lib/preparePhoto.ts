import * as ImageManipulator from 'expo-image-manipulator';

/** Match web preparePhoto: longest side ≤1800px, JPEG ~0.82. */
export async function preparePhoto(uri: string): Promise<ImageManipulator.ImageResult> {
  const probe = await ImageManipulator.manipulateAsync(uri, [], { compress: 1 });
  const longest = Math.max(probe.width, probe.height);
  const scale = Math.min(1, 1800 / longest);
  const width = Math.max(1, Math.round(probe.width * scale));
  const height = Math.max(1, Math.round(probe.height * scale));
  return ImageManipulator.manipulateAsync(
    uri,
    scale < 1 ? [{ resize: { width, height } }] : [],
    { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG },
  );
}
