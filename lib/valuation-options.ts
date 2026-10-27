// Selection levels for each calculator factor (kept separate so lib/scoring.ts can import them without a cycle).
export const OPTIONS = {
  powerStatus: ["Live", "Signed", "Queued", "Speculative"],
  marketTier: ["Primary", "Secondary", "Tertiary"],
  infrastructure: ["Substation+Fiber+Roads", "Substation+Fiber", "Substation+Roads", "Fiber+Roads", "Substation Only", "Fiber Only", "Roads Only", "None"],
  environmentalRisk: ["Low", "Moderate", "High"],
  sellerMotivation: ["High", "Moderate", "Low"],
  fiber: ["Excellent", "Good", "Fair"],
  water: ["Excellent", "Good", "Fair"],
  entitlements: ["Fully Entitled", "Partial", "None"],
  backupPower: ["Yes", "Planned", "None"],
  substation: ["On-Site", "Nearby", "Distant"],
  density: ["Liquid Capable", "Air Only", "Limited"],
  transmission: ["High", "Medium", "Low"],
} as const;
