/**
 * Pure intent detectors for build-from-material flows (Node-testable).
 */

import { extractHttpUrl } from '../materialParse.js';
import { normalizeCasualText } from './conversationalInterpret.js';

/** “build units / parse syllabus / create curriculum from this material/doc …” */
export function isCurriculumFromMaterialIntent(message) {
  const lower = normalizeCasualText(String(message || '')).toLowerCase();
  if (!lower.trim()) return false;
  if (/\b(how\s+(do|to|can)|where\s+(do|can)|explain)\b/.test(lower)) return false;
  if (/\b(quiz|worksheet|practice)\b/.test(lower) && !/\b(unit|lesson|curriculum|syllabus)\b/.test(lower)) {
    return false;
  }
  const wantsStructure = /\b(units?|lessons?|curriculum|syllabus|course|outline)\b/.test(lower)
    || /\bbuild\s+from\s+material\b/.test(lower)
    || /\bparse\b/.test(lower);
  if (!wantsStructure) return false;
  const fromSource = /\b(from|using|based\s+on|with)\b/.test(lower)
    && /\b(material|materials|doc|document|pdf|syllabus|upload|file|book|textbook)\b/.test(lower);
  return fromSource
    || /\bbuild\s+from\s+material\b/.test(lower)
    || /\b(upload|parse)\s+(a\s+)?(material|doc|document|pdf|syllabus)\b/.test(lower)
    || (/\bparse\b/.test(lower)
      && /\b(material|doc|document|pdf|syllabus)\b/.test(lower)
      && /\b(units?|lessons?|curriculum|outline)\b/.test(lower))
    || (/\b(create|make|generate|build|add)\b/.test(lower)
      && /\b(units?|lessons?|curriculum)\b/.test(lower)
      && /\b(material|doc|pdf|syllabus)\b/.test(lower));
}

/** “make a quiz / worksheet based on this doc / material …” */
export function isPracticeFromMaterialIntent(message) {
  const lower = normalizeCasualText(String(message || '')).toLowerCase();
  if (!lower.trim()) return false;
  if (/\bquiz\s+me\b/.test(lower)) return false;
  if (/\b(how\s+(do|to|can)|where\s+(do|can)|explain)\b/.test(lower)) return false;
  const wantsArtifact = /\b(quiz|worksheet|practice\s+(questions?|sheet|set)|problem\s+set)\b/.test(lower);
  if (!wantsArtifact) return false;
  if (!/\b(make|create|generate|build|write|draft)\b/.test(lower)) return false;
  return (
    (/\b(from|using|based\s+on|with)\b/.test(lower)
      && /\b(material|materials|doc|document|pdf|file|book|textbook|this)\b/.test(lower))
    || /\bbased\s+on\s+["“][^"”]+["”]/.test(lower)
  );
}

/** “build a lesson around this youtube / video / link …” */
export function isLessonFromLinkIntent(message) {
  const lower = normalizeCasualText(String(message || '')).toLowerCase();
  if (!lower.trim()) return false;
  if (/\b(how\s+(do|to|can)|where\s+(do|can)|explain)\b/.test(lower)) return false;
  const hasLinkCue = Boolean(extractHttpUrl(message))
    || /\b(youtube|video|vimeo|url|link)\b/.test(lower);
  if (!hasLinkCue) return false;
  return (
    (/\b(lesson|learning\s*day|class)\b/.test(lower)
      && /\b(from|around|about|using|based\s+on|for)\b/.test(lower))
    || (/\b(make|create|build|generate|schedule)\b/.test(lower)
      && /\b(lesson|learning\s*day)\b/.test(lower)
      && hasLinkCue)
  );
}
