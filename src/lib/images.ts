// Shrinks an uploaded image in the browser before it is stored: cropped to the
// 16:9 shape of the recording cards, 640×360, saved as JPEG (typically 40–90 KB).
export const THUMB_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function makeThumbnail(file: File): Promise<Blob> {
  if (!THUMB_TYPES.includes(file.type)) throw new Error('Choose a JPG, PNG or WebP image');
  const bitmap = await createImageBitmap(file);
  const W = 640;
  const H = 360;
  const scale = Math.max(W / bitmap.width, H / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot prepare images');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(bitmap, (W - w) / 2, (H - h) / 2, w, h);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The image could not be prepared'))), 'image/jpeg', 0.82));
}
