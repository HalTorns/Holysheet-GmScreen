export const FILE_IMAGE_BYTES = 10 * 1024 * 1024
export const FILE_PDF_BYTES = 16 * 1024 * 1024
export const FILE_QUOTA_BYTES = 500 * 1024 * 1024
export const PROJECT_FILE_LIMIT = 200

// Inspect only signatures; the declared MIME and filename never select the type.
export function detectFileMime(bytes: Uint8Array) {
  const starts = (signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte)
  const text = (offset: number, value: string) =>
    new TextEncoder()
      .encode(value)
      .every((byte, index) => bytes[offset + index] === byte)
  if (starts([137, 80, 78, 71, 13, 10, 26, 10])) return 'image/png'
  if (starts([255, 216, 255])) return 'image/jpeg'
  if (text(0, 'GIF87a') || text(0, 'GIF89a')) return 'image/gif'
  if (text(0, 'RIFF') && text(8, 'WEBP')) return 'image/webp'
  if (text(0, '%PDF-')) return 'application/pdf'
  return null
}
