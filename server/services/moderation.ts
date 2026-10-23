// First-line, deterministic content screening for community text. This catches obvious
// abuse and spam before it is stored; user reports + the admin queue handle the rest.

const BLOCKED_TERMS = [
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "asshole",
  "bastard",
  "whore",
  "slut",
  "retard",
  "faggot",
  "nigger",
  "kill yourself",
  "kys",
];

const CRISIS_PATTERNS = [
  /\b(kill|hurt|harm)(ing)? myself\b/i,
  /\bsuicid(e|al)\b/i,
  /\bend (it all|my life)\b/i,
  /\bdon'?t want to (live|be alive|be here)\b/i,
  /\bwant to die\b/i,
  /\bself[- ]harm\b/i,
];

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
  /** Text suggests the author may be in crisis; the client shows crisis resources. */
  crisis: boolean;
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/\$/g, "s");
}

export function moderateText(text: string): ModerationResult {
  const crisis = CRISIS_PATTERNS.some((p) => p.test(text));
  const norm = normalize(text);
  const words = new Set(norm.split(/[^a-z]+/).filter(Boolean));
  for (const term of BLOCKED_TERMS) {
    const hit = term.includes(" ") ? norm.includes(term) : words.has(term);
    if (hit) return { allowed: false, reason: "Please keep posts kind and free of offensive language.", crisis };
  }
  const links = text.match(/https?:\/\/|www\./gi)?.length ?? 0;
  if (links > 1) return { allowed: false, reason: "Posts may include at most one link.", crisis };
  if (/(.)\1{9,}/.test(text)) return { allowed: false, reason: "This looks like spam.", crisis };
  return { allowed: true, crisis };
}
