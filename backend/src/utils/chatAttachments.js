export function hasValidChatAttachment(contentType, file) {
  if (!Buffer.isBuffer(file) || !file.length) return false
  if (contentType === 'image/jpeg') return file.length >= 3 && file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff
  if (contentType === 'image/png') return file.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (contentType === 'image/webp') return file.length >= 12 && file.toString('ascii', 0, 4) === 'RIFF' && file.toString('ascii', 8, 12) === 'WEBP'
  if (contentType === 'image/gif') return file.toString('ascii', 0, 6) === 'GIF87a' || file.toString('ascii', 0, 6) === 'GIF89a'
  return false
}
