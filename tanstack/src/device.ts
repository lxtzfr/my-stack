import { UAParser } from 'ua-parser-js'

// Mirrors what UAParser's device.type can actually report (mobile, tablet,
// smarttv, console, wearable, embedded, xr) plus two fallbacks: 'desktop'
// (UAParser deliberately never reports this — see parseDevice) and
// 'unknown' (no User-Agent header at all).
export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'smarttv' | 'console' | 'wearable' | 'embedded' | 'xr' | 'unknown'

export interface ParsedDevice {
  type: DeviceType
  label: string
}

// UAParser only ever reports device.type for these categories — plain
// desktop browsers report no device.type at all, so 'desktop' below is our
// own fallback for "none of the above", not something UAParser tells us.
const UAPARSER_DEVICE_TYPES = new Set(['mobile', 'tablet', 'smarttv', 'console', 'wearable', 'embedded', 'xr'])

const FALLBACK_PLATFORM: Record<Exclude<DeviceType, 'unknown'>, string> = {
  mobile: 'Mobile',
  tablet: 'Tablet',
  desktop: 'Desktop',
  smarttv: 'Smart TV',
  console: 'Console',
  wearable: 'Wearable',
  embedded: 'Embedded',
  xr: 'XR',
}

// Turns a raw `User-Agent` header into a coarse device type plus a
// human-readable "Platform · Browser" label, e.g. for a visitor log.
export function parseDevice(userAgent: string | undefined | null): ParsedDevice {
  if (!userAgent) return { type: 'unknown', label: '' }

  const { browser, device, os } = UAParser(userAgent)
  const type: Exclude<DeviceType, 'unknown'> =
    device.type && UAPARSER_DEVICE_TYPES.has(device.type) ? (device.type as Exclude<DeviceType, 'unknown'>) : 'desktop'
  const platform = os.name ?? FALLBACK_PLATFORM[type]
  return { type, label: browser.name ? `${platform} · ${browser.name}` : platform }
}
