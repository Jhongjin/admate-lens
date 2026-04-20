const fs = require('fs');
const content = fs.readFileSync('src/lib/capture/channels/youtube-capture.ts', 'utf8');

const start = content.indexOf('const result = await page.evaluate<boolean>(');
const end = content.indexOf('})()', start);
const inner = content.substring(start + 48, end + 4);

try {
    new Function(inner);
    console.log('Syntax OK!');
} catch(e) {
    console.error('Syntax Error: ' + e.message);
}
