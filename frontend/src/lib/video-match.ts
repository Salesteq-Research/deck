/**
 * Strict video-to-vehicle matching.
 * Each video ID maps to a regex that matches ONLY the correct vehicle names.
 */
const VIDEO_PATTERNS: Record<string, RegExp> = {
  // Specific models first (longer match wins)
  'i7-m70':       /\bi7\s*m70\b/i,                    // "BMW i7 M70"
  'i4-m50':       /\bi4\s*m50\b/i,                    // "BMW i4 M50"
  'ix-m70':       /\biX\s*m70\b/i,                    // "BMW iX M70"
  'i5-m60':       /\bi5\s*m60\b/i,                    // "BMW i5 M60"
  'x5-m':         /\bx5\s*m\b/i,                      // "BMW X5 M Competition"
  'x6-m':         /\bx6\s*m\b/i,                      // "BMW X6 M Competition"
  'x3-m50':       /\bx3\s*m50\b/i,                    // "BMW X3 M50"
  'm3-limousine': /\bm3\b(?!4).*\blimousine\b/i,      // "M3 Competition Limousine"
  'm4-coupe':     /\bm4\b.*\b(coup|cabrio)/i,         // "M4 Competition Coupé/Cabriolet"
  'm5-touring':   /\bm5\b.*\btouring\b/i,             // "M5 Touring"
  'm5':           /\bm5\b(?!\s*touring)/i,             // "M5 Limousine" but not M5 Touring
  'm2':           /\bm2\b/i,                           // "BMW M2"
  // General models
  'i7':           /\bi7\b/i,                           // "BMW i7"
  'ix':           /\biX\b(?!\d)/,                      // "iX xDrive45" but NOT iX1/iX2/iX3
  'x7':           /\bx7\b/i,                           // "BMW X7"
  'x5':           /\bx5\b/i,                           // "BMW X5"
  'x6':           /\bx6\b/i,                           // "BMW X6"
  'x3':           /\bx3\b/i,                           // "BMW X3"
  'xm':           /\bxm\b/i,                           // "BMW XM"
  'z4':           /\bz4\b/i,                           // "BMW Z4"
  '7er-limousine': /\b7er\b.*\blimousine\b|\b7\s*series\b/i, // "7er Limousine" / "7 Series"
  '5er-limousine': /\b5er\b.*\blimousine\b|\b5\s*series\b.*\blimousine\b/i,
  '3er-limousine': /\b3er\b.*\blimousine\b|\b3\s*series\b.*\blimousine\b/i,
}

export function matchVideoForVehicle(
  vehicleName: string,
  videoMap: Record<string, string>,
): string | undefined {
  for (const [id, pattern] of Object.entries(VIDEO_PATTERNS)) {
    if (videoMap[id] && pattern.test(vehicleName)) {
      return videoMap[id]
    }
  }
  return undefined
}

export function matchVideoId(
  vehicleName: string,
  videoMap: Record<string, string>,
): string | undefined {
  for (const [id, pattern] of Object.entries(VIDEO_PATTERNS)) {
    if (videoMap[id] && pattern.test(vehicleName)) {
      return id
    }
  }
  return undefined
}
