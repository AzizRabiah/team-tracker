import json
import pathlib
import sys

root = pathlib.Path(__file__).parent
css = (root/'src/style.css').read_text(encoding='utf-8')
js = (root/'src/app.js').read_text(encoding='utf-8')
assert '</script' not in js
tpl = (root/'src/index.tpl.html').read_text(encoding='utf-8')
html = tpl.replace('/*CSS*/', css).replace('/*JS*/', js)

# python build.py          -> dist/cloud-tracker.html (offline, data embedded from src/seed.json)
# python build.py --cloud  -> dist/index.html (shared, reads src/cloud.json: {"url": ..., "key": ...})
if '--cloud' in sys.argv:
    cfg = json.load(open(root/'src/cloud.json', encoding='utf-8'))
    assert cfg['url'].startswith('https://') and cfg['url'].endswith('.supabase.co')
    html = html.replace('/*CONNECT*/', cfg['url'])
    html = html.replace('id="cloud-config">null</script>', 'id="cloud-config">' + json.dumps({'url': cfg['url'], 'key': cfg['key']}) + '</script>', 1)
    out = root/'dist/index.html'
else:
    seed = json.dumps(json.load(open(root/'src/seed.json', encoding='utf-8')), ensure_ascii=True).replace('<', '\\u003c')
    html = html.replace('/*CONNECT*/', "'none'")
    html = html.replace('id="tracker-data">null</script>', 'id="tracker-data">' + seed + '</script>', 1)
    out = root/'dist/cloud-tracker.html'
out.write_text(html, encoding='utf-8')
print('built', out, out.stat().st_size, 'bytes')
