import { TranscriptEntry } from './types';

export interface GuardrailOutcome {
  allowed: boolean;
  response?: string;
  requiresResponseValidation?: boolean;
}

const CISSP_KEYWORDS = [
  'access control',
  'accountability',
  'architecture',
  'asset security',
  'audit',
  'availability',
  'bcp',
  'business continuity',
  'change management',
  'cissp',
  'compliance',
  'confidentiality',
  'cryptography',
  'data classification',
  'disaster recovery',
  'domain',
  'due care',
  'due diligence',
  'environmental controls',
  'exam',
  'facility',
  'fire suppression',
  'firewall',
  'forensics',
  'governance',
  'iam',
  'identity',
  'incident response',
  'integrity',
  'least privilege',
  'network security',
  'nist',
  'privacy',
  'quiz',
  'question',
  'risk',
  'sdlc',
  'security',
  'threat',
  'vulnerability',
  'zero trust'
];

const SECURITY_RESPONSE_KEYWORDS = [
  ...CISSP_KEYWORDS,
  'alarm',
  'badge',
  'biometric',
  'clean agent',
  'controls',
  'data center',
  'defense in depth',
  'defensive',
  'dry pipe',
  'egress',
  'environmental',
  'facility security',
  'fire detection',
  'guard',
  'life safety',
  'mantrap',
  'physical access',
  'physical security',
  'preaction',
  'protective controls',
  'safeguard',
  'safeguards',
  'security control',
  'security controls',
  'server room',
  'suppression',
  'wet pipe'
];

const FOLLOW_UP_KEYWORDS = [
  'answer',
  'because',
  'correct',
  'explain',
  'option',
  'question',
  'quiz',
  'why'
];

const UNSAFE_KEYWORDS = [
  'backdoor',
  'bypass authentication',
  'credential stuffing',
  'ddos',
  'dropper',
  'exploit',
  'exfiltrate',
  'keylogger',
  'malware',
  'payload',
  'phish',
  'ransomware',
  'rootkit',
  'shellcode',
  'sql injection',
  'steal password',
  'trojan'
];

function includesAnyKeyword(haystack: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => haystack.includes(keyword));
}

function buildOutOfScopeResponse(): string {
  return [
    'Johnny Avakian Presents CISSP Buddy is scoped to CISSP study and defensive security concepts.',
    '',
    'Try asking about one of the CISSP domains, a security principle, or a practice question instead.'
  ].join('\n');
}

export function isChoiceAnswer(value: string): boolean {
  return /^[abcd]$/i.test(value.trim());
}

export function isSecurityRelatedResponse(text: string): boolean {
  const normalizedText = text.trim().toLowerCase();

  if (normalizedText.length === 0) {
    return false;
  }

  if (includesAnyKeyword(normalizedText, SECURITY_RESPONSE_KEYWORDS)) {
    return true;
  }

  if (
    normalizedText.includes('fm-200') &&
    includesAnyKeyword(normalizedText, [
      'asset',
      'clean agent',
      'data center',
      'environmental',
      'facility',
      'fire',
      'life safety',
      'physical',
      'suppression'
    ])
  ) {
    return true;
  }

  return false;
}

export function getOutOfScopeResponse(): string {
  return buildOutOfScopeResponse();
}

function isLikelyFollowUp(value: string, transcript: readonly TranscriptEntry[]): boolean {
  if (transcript.length === 0) {
    return false;
  }

  if (value.length > 120) {
    return false;
  }

  return includesAnyKeyword(value, FOLLOW_UP_KEYWORDS);
}

export function evaluatePrompt(
  rawPrompt: string,
  transcript: readonly TranscriptEntry[]
): GuardrailOutcome {
  const trimmedPrompt = rawPrompt.trim();
  const normalizedPrompt = trimmedPrompt.toLowerCase();

  if (trimmedPrompt.length === 0) {
    return {
      allowed: false,
      response: 'Ask a CISSP topic, or answer the current quiz with A, B, C, or D.'
    };
  }

  if (isChoiceAnswer(trimmedPrompt)) {
    return { allowed: true };
  }

  if (includesAnyKeyword(normalizedPrompt, UNSAFE_KEYWORDS)) {
    return {
      allowed: false,
      response: [
        'Johnny Avakian Presents CISSP Buddy stays on safe, defensive CISSP study help.',
        '',
        'I cannot help with offensive or harmful cyber instructions.',
        'If you want, ask about the defensive principles, risk implications, or exam concepts behind that topic instead.'
      ].join('\n')
    };
  }

  if (includesAnyKeyword(normalizedPrompt, CISSP_KEYWORDS) || isLikelyFollowUp(normalizedPrompt, transcript)) {
    return {
      allowed: true,
      requiresResponseValidation: false
    };
  }

  return {
    allowed: true,
    requiresResponseValidation: true,
    response: buildOutOfScopeResponse()
  };
}
