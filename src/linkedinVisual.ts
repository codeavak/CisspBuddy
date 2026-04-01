import {
  LinkedInVisualMotif,
  LinkedInVisualPalette,
  LinkedInVisualSpec
} from './types';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const MOTIFS: LinkedInVisualMotif[] = [
  'shield',
  'network',
  'continuity',
  'identity',
  'governance',
  'data',
  'incident'
];

const PALETTES: LinkedInVisualPalette[] = [
  {
    backgroundStart: '#0c2238',
    backgroundEnd: '#133f63',
    accent: '#4bd38f',
    highlight: '#d5b15d'
  },
  {
    backgroundStart: '#1a203a',
    backgroundEnd: '#334d8b',
    accent: '#68c7ff',
    highlight: '#f2d36b'
  },
  {
    backgroundStart: '#112a2d',
    backgroundEnd: '#1f5660',
    accent: '#72e0cf',
    highlight: '#f3cf74'
  },
  {
    backgroundStart: '#281d3b',
    backgroundEnd: '#4d3f79',
    accent: '#86d4ff',
    highlight: '#f1c95a'
  },
  {
    backgroundStart: '#14261f',
    backgroundEnd: '#2d6a4f',
    accent: '#7de2a7',
    highlight: '#f3cf77'
  }
];

export function parseLinkedInVisualSpec(responseText: string | undefined, topic: string): LinkedInVisualSpec {
  const fallback = buildFallbackLinkedInVisualSpec(topic);
  const jsonObject = extractFirstJsonObject(responseText);

  if (!jsonObject) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(jsonObject) as {
      eyebrow?: unknown;
      headline?: unknown;
      subheadline?: unknown;
      keywords?: unknown;
      imagePlot?: unknown;
      motif?: unknown;
      palette?: {
        backgroundStart?: unknown;
        backgroundEnd?: unknown;
        accent?: unknown;
        highlight?: unknown;
      };
    };

    return {
      eyebrow: sanitizeText(parsed.eyebrow, fallback.eyebrow, 28),
      headline: sanitizeText(parsed.headline, fallback.headline, 58),
      subheadline: sanitizeText(parsed.subheadline, fallback.subheadline, 120),
      keywords: sanitizeKeywords(parsed.keywords, fallback.keywords),
      imagePlot: sanitizeImagePlot(parsed.imagePlot, fallback.imagePlot),
      motif: sanitizeMotif(parsed.motif, fallback.motif),
      palette: sanitizePalette(parsed.palette, fallback.palette)
    };
  } catch {
    return fallback;
  }
}

function buildFallbackLinkedInVisualSpec(topic: string): LinkedInVisualSpec {
  const normalizedTopic = collapseWhitespace(topic);
  const motif = inferMotif(normalizedTopic);
  const palette = PALETTES[Math.abs(hashString(normalizedTopic)) % PALETTES.length];

  return {
    eyebrow: 'CISSP Topic Focus',
    headline: buildFallbackHeadline(normalizedTopic),
    subheadline: truncateText(
      `Understand how ${normalizedTopic} shapes risk reduction, resilient design, and stronger CISSP exam reasoning.`,
      120
    ),
    keywords: buildFallbackKeywords(normalizedTopic, motif),
    imagePlot: buildFallbackImagePlot(normalizedTopic, motif),
    motif,
    palette
  };
}

function buildFallbackHeadline(topic: string): string {
  if (topic.length <= 52) {
    return titleCase(topic);
  }

  return truncateText(`Master ${topic}`, 58);
}

function buildFallbackKeywords(topic: string, motif: LinkedInVisualMotif): string[] {
  const tokens = collapseWhitespace(topic)
    .split(' ')
    .map((token) => token.replace(/[^a-zA-Z0-9/-]/g, ''))
    .filter((token) => token.length >= 3)
    .slice(0, 2)
    .map(titleCase);

  const motifKeywordMap: Record<LinkedInVisualMotif, string[]> = {
    shield: ['Risk Reduction', 'Security Design', 'Exam Focus'],
    network: ['Architecture', 'Trust Boundaries', 'Visibility'],
    continuity: ['Resilience', 'Availability', 'Recovery'],
    identity: ['Access Control', 'Verification', 'Least Privilege'],
    governance: ['Governance', 'Policy', 'Decision Making'],
    data: ['Data Protection', 'Classification', 'Privacy'],
    incident: ['Incident Response', 'Containment', 'Lessons Learned']
  };

  const keywords = [...tokens, ...motifKeywordMap[motif]];
  return keywords.slice(0, 3);
}

function sanitizeKeywords(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const keywords = value
    .map((item) => sanitizeText(item, '', 22))
    .filter((item) => item.length > 0)
    .slice(0, 3);

  return keywords.length === 3 ? keywords : fallback;
}

function sanitizeImagePlot(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = collapseWhitespace(value);
  if (normalized.length < 40) {
    return fallback;
  }

  return truncateText(normalized, 360);
}

function sanitizeMotif(value: unknown, fallback: LinkedInVisualMotif): LinkedInVisualMotif {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase() as LinkedInVisualMotif;
  return MOTIFS.includes(normalized) ? normalized : fallback;
}

function sanitizePalette(
  value: {
    backgroundStart?: unknown;
    backgroundEnd?: unknown;
    accent?: unknown;
    highlight?: unknown;
  } | undefined,
  fallback: LinkedInVisualPalette
): LinkedInVisualPalette {
  if (!value) {
    return fallback;
  }

  return {
    backgroundStart: sanitizeColor(value.backgroundStart, fallback.backgroundStart),
    backgroundEnd: sanitizeColor(value.backgroundEnd, fallback.backgroundEnd),
    accent: sanitizeColor(value.accent, fallback.accent),
    highlight: sanitizeColor(value.highlight, fallback.highlight)
  };
}

function sanitizeColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return HEX_COLOR_PATTERN.test(trimmed) ? trimmed : fallback;
}

function sanitizeText(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = collapseWhitespace(value);
  if (normalized.length === 0) {
    return fallback;
  }

  return truncateText(normalized, maxLength);
}

function inferMotif(topic: string): LinkedInVisualMotif {
  const normalized = topic.toLowerCase();

  if (/(identity|iam|zero trust|least privilege|authentication|authorization|access)/.test(normalized)) {
    return 'identity';
  }

  if (/(continuity|disaster|recovery|availability|resilience|backup)/.test(normalized)) {
    return 'continuity';
  }

  if (/(network|segmentation|perimeter|cloud|architecture|microsegmentation)/.test(normalized)) {
    return 'network';
  }

  if (/(governance|policy|compliance|risk|audit|law|regulation)/.test(normalized)) {
    return 'governance';
  }

  if (/(data|privacy|classification|retention|protection|encryption)/.test(normalized)) {
    return 'data';
  }

  if (/(incident|response|forensics|containment|detection)/.test(normalized)) {
    return 'incident';
  }

  return 'shield';
}

function buildFallbackImagePlot(topic: string, motif: LinkedInVisualMotif): string {
  const motifPromptMap: Record<LinkedInVisualMotif, string> = {
    shield:
      'a luminous shield, layered security contours, subtle cyber texture, calm executive visual tone',
    network:
      'secure network pathways, segmented nodes, trust boundaries, architectural depth, executive cybersecurity styling',
    continuity:
      'resilience arcs, recovery loops, operational continuity symbolism, steady confident composition',
    identity:
      'identity verification cues, access pathways, trust controls, clean modern security illustration',
    governance:
      'governance framework shapes, decision pathways, policy alignment, strategic oversight visual language',
    data:
      'protected data layers, flowing information contours, classification cues, privacy-first visual storytelling',
    incident:
      'incident response motion, alert geometry, containment cues, measured operational urgency'
  };

  return truncateText(
    `Create a polished LinkedIn cybersecurity image about ${topic}. Show ${motifPromptMap[motif]}. Use a premium dark navy and gold visual direction with clean lighting, no mascots, no app logo, no watermark, no extra text beyond what fits a professional social graphic, and a serious editorial design style suited for CISSP study content.`,
    360
  );
}

function extractFirstJsonObject(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return undefined;
  }

  return candidate.slice(start, end + 1);
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function titleCase(value: string): string {
  return collapseWhitespace(value)
    .split(' ')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function hashString(value: string): number {
  let hash = 0;

  for (const character of value) {
    hash = (hash << 5) - hash + character.charCodeAt(0);
    hash |= 0;
  }

  return hash;
}
