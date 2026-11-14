"""Assemble index.html (GitHub Pages) and artifact.html from index.src.html + leaflet CSS."""
import pathlib, hashlib
root = pathlib.Path(__file__).parent
src = (root / 'index.src.html').read_text(encoding='utf-8')
src = src.replace('/*LEAFLET_CSS*/', (root / 'leaflet.min.css').read_text(encoding='utf-8'))
# cache-busting: the browser must not pair a new page with an old app.js
src = src.replace('src="app.js"', 'src="app.js?v=' + hashlib.md5((root / 'app.js').read_bytes()).hexdigest()[:8] + '"')
(root / 'artifact.html').write_text(src, encoding='utf-8')
head, body = src.split('<div class="wrap">', 1)
page = ('<!doctype html>\n<html lang="th">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + head + '\n</head>\n<body>\n<div class="wrap">' + body + '\n</body>\n</html>\n')
(root / 'index.html').write_text(page, encoding='utf-8')
print('ok', len(page))
