/** Detect HEIC/HEIF (incl. empty MIME from macOS folder picker) and decode for canvas / <img>. */

export async function sniffLikelyHeic(blob: Blob): Promise<boolean> {
  const t = blob.type.toLowerCase()
  if (t === 'image/heic' || t === 'image/heif') return true
  if (blob.size < 12) return false
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer())
  const tag = String.fromCharCode(head[4]!, head[5]!, head[6]!, head[7]!)
  if (tag !== 'ftyp') return false
  const brand = String.fromCharCode(head[8]!, head[9]!, head[10]!, head[11]!)
  return /^(heic|heix|hevc|hevx|mif1|msf1|heim|heis)$/i.test(brand)
}

/** Returns JPEG when input is HEIC/HEIF; otherwise returns the same blob. */
export async function decodeIfHeic(blob: Blob, fileNameHint?: string): Promise<Blob> {
  const byName = /\.hei[cf]$/i.test(fileNameHint ?? '')
  if (!(await sniffLikelyHeic(blob)) && !byName) return blob
  const heic2any = (await import('heic2any')).default
  const result = await heic2any({ blob, toType: 'image/jpeg', quality: 0.92 })
  const out = Array.isArray(result) ? result[0] : result
  if (!out || !(out instanceof Blob)) {
    throw new Error('HEIC conversion produced no image data')
  }
  return out
}
