import { mmss } from './util/text.mjs';
export function toMarkdown(job, tr = null) {
  const m = tr ?? job.minutes;
  const sp = (j) => job.speakers?.[j] ?? j;
  const L = [`# ${m.title}`, '', m.summary, '', '## Decisions', ...m.decisions.map((d) => `- ${d.text} _(${mmss(job.minutes.decisions.find((x) => x.seg === d.seg)?.at ?? d.at)})_`), '', '## Action items', '| Owner | Task | Due | At |', '|---|---|---|---|', ...m.actions.map((a) => `| ${a.owner} | ${a.task} | ${a.due || '—'} | ${mmss(a.at)} |`), '', '## Risks', ...m.risks.map((r) => `- ${r.text} _(${mmss(r.at)})_`), '', '## Transcript', ...job.segments.map((s) => `**${sp(s.speaker)}** _${mmss(s.startMs)}_ — ${s.text}`), '', `---`, `_Generated on-device with Tether QVAC (${job.receipt?.qvac?.version}). Offline verdict: ${job.receipt?.verdict}._`];
  return L.join('\n');
}
