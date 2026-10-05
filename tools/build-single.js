// Builds a single self-contained page (engine inlined, no document skeleton)
// for publishing as a claude.ai artifact.  Usage: node tools/build-single.js out.html
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'engine.js'), 'utf8');
// Artifacts may only load fonts from Google Fonts, so swap the self-hosted copies back out.
html = html.replace('<link rel="stylesheet" href="fonts/fonts.css">', () => '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Caslon+Display&family=Old+Standard+TT:ital,wght@0,400;0,700;1,400&family=Cutive+Mono&family=Pinyon+Script&display=swap">');
html = html.replace('<script src="engine.js"></script>', () => '<script>\n' + engine + '\n</script>');
html = html.replace(/^[\s\S]*?<meta name="viewport"[^>]*>\n/, '').replace('</head>\n<body>\n', '').replace(/<\/body>\n<\/html>\n?$/, '');
fs.writeFileSync(process.argv[2] || 'great-clock.html', html);
