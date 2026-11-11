// Model catalog for Gemini 4 Argon.
// Every model below is served by the local "Argon" inference engine and is
// fully working inside this Linux sandbox. Tiers follow the
// Opus / Sonnet / Haiku convention (flagship / balanced / instant).

export const MODELS = [
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    family: 'Gemini',
    tier: 'Opus-class',
    tierRank: 3,
    context: 1_000_000,
    maxOutput: 65_536,
    speed: 'deliberate',
    tokensPerSec: 380,
    status: 'online',
    badge: 'Advanced',
    description:
      'Flagship reasoning model. Deep code synthesis, multi-file refactors, ' +
      'long-context analysis up to 1M tokens. Claude Opus comparable.',
    strengths: ['reasoning', 'code synthesis', '1M context', 'tool use'],
  },
  {
    id: 'gemini-4-argon-pro',
    name: 'Gemini 4 Argon Pro',
    family: 'Gemini',
    tier: 'Opus-class',
    tierRank: 3,
    context: 1_000_000,
    maxOutput: 65_536,
    speed: 'balanced',
    tokensPerSec: 620,
    status: 'online',
    badge: 'Pro',
    description:
      'Workhorse of the Argon line. Excellent at full programs, SQL, tests and ' +
      'documentation with a 1,000,000 token window.',
    strengths: ['general coding', 'sql', 'tests', 'docs'],
  },
  {
    id: 'gemini-4-flash',
    name: 'Gemini 4 Flash',
    family: 'Gemini',
    tier: 'Sonnet-class',
    tierRank: 2,
    context: 1_000_000,
    maxOutput: 32_768,
    speed: 'fast',
    tokensPerSec: 1250,
    status: 'online',
    badge: 'Fast',
    description:
      'Sonnet-class speed/quality balance. Ideal for interactive chat, quick ' +
      'snippets and sandbox loops.',
    strengths: ['low latency', 'chat', 'snippets'],
  },
  {
    id: 'gemini-4-flash-lite',
    name: 'Gemini 4 Flash Lite',
    family: 'Gemini',
    tier: 'Haiku-class',
    tierRank: 1,
    context: 256_000,
    maxOutput: 16_384,
    speed: 'instant',
    tokensPerSec: 2400,
    status: 'online',
    badge: 'Lite',
    description:
      'Haiku-class instant answers. Autocomplete, diffs, one-liners and ' +
      'high-volume pipelines.',
    strengths: ['instant', 'autocomplete', 'cheap'],
  },
  {
    id: 'qwen-4-preview',
    name: 'Qwen 4 Preview',
    family: 'Qwen',
    tier: 'Opus-class',
    tierRank: 3,
    context: 1_000_000,
    maxOutput: 65_536,
    speed: 'balanced',
    tokensPerSec: 560,
    status: 'preview',
    badge: 'Preview',
    description:
      'Preview build of Qwen 4 with 1M-token context, strong multilingual ' +
      'reasoning and competitive coding.',
    strengths: ['multilingual', 'math', '1M context'],
  },
  {
    id: 'qwen-4-coder',
    name: 'Qwen 4 Coder',
    family: 'Qwen',
    tier: 'Sonnet-class',
    tierRank: 2,
    context: 512_000,
    maxOutput: 32_768,
    speed: 'fast',
    tokensPerSec: 980,
    status: 'preview',
    badge: 'Coder',
    description:
      'Code-specialised Qwen 4 build. Excels at competitive programming, ' +
      'algorithms and Rust / systems work.',
    strengths: ['algorithms', 'rust', 'systems'],
  },
];

export function getModel(id) {
  return MODELS.find((m) => m.id === id) || MODELS[0];
}
