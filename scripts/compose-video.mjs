// Mixes the narration into the recorded webm (scripts/make-video.mjs writes $WORK/timeline.json). Re-run alone to re-mix after
// changing narration:  node scripts/video/..tts.py first, then  node scripts/compose-video.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const AUDIO = process.env.AUDIO_DIR ?? '/tmp/pm-tts';
const WORK = process.env.WORK_DIR ?? '/tmp/pm-video';
const OUT = process.env.OUT ?? resolve(import.meta.dirname, '..', 'docs', 'demo.mp4');
const W = 1920, H = 1080;
const dur = JSON.parse(readFileSync(`${AUDIO}/durations.json`, 'utf8'));
const { scenes, webm } = JSON.parse(readFileSync(`${WORK}/timeline.json`, 'utf8'));
// ---- compose: per scene, speed up if the real wait exceeded the narration; label every sped-up scene.
const OFFSET = Number(process.env.VIDEO_OFFSET ?? 0.6); // playwright's video starts ~0.6 s after t0
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf';
let outT = 0; const parts = [], audioIn = [], audioF = [];
scenes.forEach((s, i) => {
  const real = s.end - s.start, target = dur[s.id] + 0.7;
  const speed = real > target * 1.08 ? real / target : 1;
  const outLen = real / speed;
  let f = `[0:v]trim=start=${(s.start + OFFSET).toFixed(3)}:end=${(s.end + OFFSET).toFixed(3)},setpts=(PTS-STARTPTS)/${speed.toFixed(4)}`;
  if (speed > 1) f += `,drawbox=x=0:y=ih-92:w=iw:h=92:color=black@0.62:t=fill,drawtext=fontfile=${FONT}:fontsize=40:fontcolor=white:x=(w-text_w)/2:y=h-66:text='SPED UP ${speed.toFixed(1)}x  ·  real time %{eif\\:floor(t*${speed.toFixed(4)}/60)\\:d\\:2}\\:%{eif\\:mod(floor(t*${speed.toFixed(4)})\\,60)\\:d\\:2}  ·  (${Math.round(real)} s of real compute)'`;
  f += `,fps=30,format=yuv420p[v${i}]`; parts.push(f);
  const ms = Math.round(outT * 1000); audioIn.push('-i', `${AUDIO}/${s.id}.wav`);
  audioF.push(`[${i + 1}:a]adelay=${ms}|${ms}[a${i}]`);
  console.log(`  ${s.id}: real ${real.toFixed(1)}s -> out ${outLen.toFixed(1)}s (x${speed.toFixed(2)})`);
  outT += outLen;
});
const filt = [...parts, parts.map((_, i) => `[v${i}]`).join('') + `concat=n=${parts.length}:v=1:a=0[vout]`, ...audioF, scenes.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${scenes.length}:normalize=0,loudnorm=I=-16:TP=-1.5[aout]`].join(';\n');
writeFileSync(`${WORK}/filter.txt`, filt);
mkdirSync(resolve(OUT, '..'), { recursive: true });
execFileSync('ffmpeg', ['-y', '-i', `${WORK}/${webm}`, ...audioIn, '-filter_complex_script', `${WORK}/filter.txt`, '-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', OUT], { stdio: 'inherit' });
console.log('wrote', OUT, 'duration ~', outT.toFixed(0), 's');
