// Deterministic speaker-name inference from vocatives: "Thanks, Priya." (previous speaker) / "Marcus, you own that." (next speaker).
import { appearsIn } from '../util/text.mjs';

const NOT_NAMES = new Set(['okay', 'ok', 'good', 'great', 'fine', 'now', 'yes', 'no', 'thanks', 'thank', 'sure', 'right', 'well', 'so', 'agreed', 'understood', 'next', 'also', 'and', 'but', 'then', 'today', 'again', 'please', 'hello', 'hi', 'hey', 'welcome', 'perfect', 'exactly', 'sorry', 'maybe', 'however', 'first', 'second', 'finally', 'last', 'one', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'everyone', 'everybody', 'team', 'folks', 'all']);

export function inferSpeakerNames(segments) {
  const votes = {}; // label -> {name: count}
  const vote = (label, name) => { if (!label || !name) return; (votes[label] ??= {}); votes[label][name] = (votes[label][name] ?? 0) + 1; };
  const nextOther = (i) => segments.slice(i + 1, i + 4).find((s) => s.speaker !== segments[i].speaker)?.speaker;
  const prevOther = (i) => segments.slice(Math.max(0, i - 3), i).reverse().find((s) => s.speaker !== segments[i].speaker)?.speaker;
  const NAME = '([A-Z][a-z]{2,})';
  for (let i = 0; i < segments.length; i++) {
    const t = segments[i].text.trim();
    let m;
    if ((m = t.match(new RegExp(`^(?:thanks|thank you)[,!]?\\s+${NAME}\\b`, 'i'))) && /^[A-Z]/.test(m[1])) vote(prevOther(i), m[1]);
    else if ((m = t.match(new RegExp(`^${NAME},\\s`))) && !NOT_NAMES.has(m[1].toLowerCase())) vote(nextOther(i), m[1]);
    else if ((m = t.match(new RegExp(`,\\s+${NAME}[?!.]$`))) && !NOT_NAMES.has(m[1].toLowerCase())) vote(nextOther(i), m[1]);
    if ((m = t.match(new RegExp(`\\b(?:i'm|i am|this is|my name is)\\s+${NAME}\\b`, 'i'))) && /^[A-Z]/.test(m[1]) && !NOT_NAMES.has(m[1].toLowerCase())) vote(segments[i].speaker, m[1]);
  }
  const names = {};
  const taken = new Set();
  const ranked = Object.entries(votes).flatMap(([label, c]) => Object.entries(c).map(([name, n]) => ({ label, name, n }))).sort((a, b) => b.n - a.n);
  for (const { label, name } of ranked) {
    if (names[label] || taken.has(name)) continue;
    // the name must not also be heavily voted for a different speaker
    names[label] = name; taken.add(name);
  }
  return names;
}
export { appearsIn };
