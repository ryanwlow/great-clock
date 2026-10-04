// Builds a single self-contained page (engine inlined, no document skeleton)
// for publishing as a claude.ai artifact.  Usage: node tools/build-single.js out.html
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'engine.js'), 'utf8');
html = html.replace('<script src="engine.js"></script>', () => '<script>\n' + engine + '\n</script>');
html = html.replace(/^[\s\S]*?<meta name="viewport"[^>]*>\n/, '').replace('</head>\n<body>\n', '').replace(/<\/body>\n<\/html>\n?$/, '');
fs.writeFileSync(process.argv[2] || 'great-clock.html', html);
