const fs = require('fs');
const content = fs.readFileSync('src/lib/capture/channels/youtube-capture.ts', 'utf8');

const start = content.indexOf('const result = await page.evaluate<boolean>(');
const end = content.indexOf('})()', start);
const inner = content.substring(start + 48, end + 4);

let lines = inner.split('\n');
lines.forEach((l, i) => console.log((i+1).toString().padStart(3, '0') + ': ' + l));
