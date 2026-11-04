export type Rgba = { r: number; g: number; b: number; a: number }

/**
 * Parses the forms `getComputedStyle` actually returns in Chrome: `rgb(...)`,
 * `rgba(...)`, plus hex and `transparent` for hand-written graphs.
 */
export function parseColor(value: string): Rgba | null {
  const text = value.trim().toLowerCase()

  if (text === '' || text === 'transparent') return null
  if (text.startsWith('#')) return parseHex(text)

  const match = text.match(/^rgba?\(([^)]+)\)$/)
  if (match === null) return null

  const body = match[1]
  if (body === undefined) return null

  const parts = body.split(/[,/\s]+/).filter((part) => part !== '')
  if (parts.length < 3) return null

  const [r, g, b, a] = parts

  return {
    r: Number(r),
    g: Number(g),
    b: Number(b),
    a: a === undefined ? 1 : parseAlpha(a),
  }
}

function parseAlpha(value: string): number {
  if (value.endsWith('%')) return Number(value.slice(0, -1)) / 100
  return Number(value)
}

function parseHex(text: string): Rgba | null {
  const hex = text.slice(1)

  if (hex.length === 3 || hex.length === 4) {
    const [r, g, b, a] = hex.split('')
    if (r === undefined || g === undefined || b === undefined) return null

    return {
      r: Number.parseInt(r + r, 16),
      g: Number.parseInt(g + g, 16),
      b: Number.parseInt(b + b, 16),
      a: a === undefined ? 1 : Number.parseInt(a + a, 16) / 255,
    }
  }

  if (hex.length === 6 || hex.length === 8) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
    }
  }

  return null
}

/** Source over destination, both in sRGB. */
export function blend(source: Rgba, destination: Rgba): Rgba {
  const a = source.a + destination.a * (1 - source.a)
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 }

  const mix = (src: number, dst: number): number =>
    (src * source.a + dst * destination.a * (1 - source.a)) / a

  return {
    r: mix(source.r, destination.r),
    g: mix(source.g, destination.g),
    b: mix(source.b, destination.b),
    a,
  }
}

export function luminance(color: Rgba): number {
  const channel = (value: number): number => {
    const s = value / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }

  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
}

export function contrastRatio(a: Rgba, b: Rgba): number {
  const first = luminance(a)
  const second = luminance(b)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)

  return (lighter + 0.05) / (darker + 0.05)
}
