import fs from 'node:fs';
import { Buffer } from 'node:buffer';
const input = process.argv[2],
  name = process.argv[3];
const e = JSON.parse(fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, ''));
const step = e.normalized_result.steps.findLast((s) => s.artifacts?.screenshot?.value);
if (!step) throw new Error('No completed screenshot artifact');
const shot = step.artifacts.screenshot.value;
fs.writeFileSync(`${name}.artifact.json`, JSON.stringify(shot));
fs.writeFileSync(`${name}.png`, Buffer.from(shot.data_base64, 'base64'));
console.log(
  JSON.stringify(
    {
      evidence: e.evidence_id,
      cleanup: e.normalized_result.browser.cleanup,
      step: step.step_id,
      completeness: e.normalized_result.completeness,
      screenshot: Object.fromEntries(Object.entries(shot).filter(([k]) => k !== 'data_base64')),
    },
    null,
    2,
  ),
);
