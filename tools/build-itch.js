// Builds the itch.io upload: dist/great-clock-itch.zip holding index.html (engine
// inlined) and the self-hosted fonts.  Usage: node tools/build-itch.js
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..'), dist = path.join(root, 'dist'), dir = path.join(dist, 'great-clock');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'engine.js'), 'utf8');
html = html.replace('<script src="engine.js"></script>', () => '<script>\n' + engine + '\n</script>');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'index.html'), html);
fs.cpSync(path.join(root, 'fonts'), path.join(dir, 'fonts'), { recursive: true });
const zip = path.join(dist, 'great-clock-itch.zip');
execFileSync('python3', ['-c', `import zipfile,sys,os
z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED)
for base,_,files in os.walk(sys.argv[2]):
    for f in files: p=os.path.join(base,f); z.write(p, os.path.relpath(p, sys.argv[2]))
z.close()`, zip, dir]);
console.log('wrote', path.relative(root, zip), fs.statSync(zip).size, 'bytes');
