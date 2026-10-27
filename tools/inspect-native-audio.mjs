import fs from 'node:fs';

const code = fs.readFileSync('docs/mapping/raw/studio.js', 'utf8');

// Find occurrences of register(..., "...")
const regex = /register\(\w+,\s*["']([^"']+)["']\)/g;
let match;
const registered = new Set();
while ((match = regex.exec(code)) !== null) {
  const name = match[1];
  if (/silence|caption|split|ripple|trim/i.test(name)) {
    registered.add(name);
  }
}

console.log('Registered classes related to silence/caption/split/ripple/trim:');
for (const name of Array.from(registered).sort()) {
  console.log(' -', name);
}

// Find LQ class definition
// Search for LQ=class or class LQ
const lqMatches = [...code.matchAll(/(\w{1,3})=class\s+extends\s+(\w+)\{constructor\(([^\)]*)\)\{([^\}]+)\}/g)];
console.log('\nSearching for RemoveSilence occurrences in studio.js:');
let idx = 0;
while ((idx = code.indexOf('"RemoveSilence"', idx)) !== -1) {
  console.log('--- At offset', idx, '---');
  console.log(code.slice(Math.max(0, idx - 100), Math.min(code.length, idx + 400)));
  idx += 15;
}

console.log('\nSearching for Captions action classes (super("...Captions...")):');
const actionRegex = /super\(["']([^"']+)["'],\s*e\)/g;
let actMatch;
const actions = new Set();
while ((actMatch = actionRegex.exec(code)) !== null) {
  if (/caption|silence|audio|clip|text/i.test(actMatch[1])) {
    actions.add(actMatch[1]);
  }
}
console.log('\n--- Searching for CaptionsGeneratorView details ---');
let cgvIdx = code.indexOf('CaptionsGeneratorView');
while (cgvIdx !== -1) {
  console.log('--- At offset', cgvIdx, '---');
  console.log(code.slice(cgvIdx, cgvIdx + 1200));
  cgvIdx = code.indexOf('CaptionsGeneratorView', cgvIdx + 20);
  if (cgvIdx > 1900000) break;
}

console.log('\n--- Finding vtt & caption formats ---');
let vttIdx = code.indexOf('"vtt"');
while (vttIdx !== -1) {
  console.log('vtt at', vttIdx, ':', code.slice(Math.max(0, vttIdx - 80), Math.min(code.length, vttIdx + 150)));
  vttIdx = code.indexOf('"vtt"', vttIdx + 5);
}
let srtLitIdx = code.indexOf('"srt"');
while (srtLitIdx !== -1) {
  console.log('srt at', srtLitIdx, ':', code.slice(Math.max(0, srtLitIdx - 80), Math.min(code.length, srtLitIdx + 150)));
  srtLitIdx = code.indexOf('"srt"', srtLitIdx + 5);
}








// Check CaptionsGeneratorView definition
console.log('\n--- CaptionsGeneratorView definition ---');
let capGenIdx = code.indexOf('"CaptionsGeneratorView"');
if (capGenIdx !== -1) {
  console.log(code.slice(Math.max(0, capGenIdx - 200), Math.min(code.length, capGenIdx + 1200)));
}

// Check LoadCaptionsForm definition
console.log('\n--- LoadCaptionsForm definition ---');
let loadCapIdx = code.indexOf('"LoadCaptionsForm"');
if (loadCapIdx !== -1) {
  console.log(code.slice(Math.max(0, loadCapIdx - 200), Math.min(code.length, loadCapIdx + 1200)));
}


