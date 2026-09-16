"""生成 SDK 端到端验收用的固定 RGBA；避免 JPEG/ICC 解码差异混入数学对照。"""
import argparse
import hashlib
import json
from pathlib import Path
import cv2

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--reference', type=Path, required=True)
p.add_argument('--images', type=Path, required=True)
p.add_argument('--out', type=Path, required=True)
a = p.parse_args()
a.out.mkdir(parents=True, exist_ok=True)
reference = json.loads(a.reference.read_text(encoding='utf-8'))
cases = []
for c in reference['cases']:
    rgb = cv2.cvtColor(cv2.imread(str(a.images / c['image'])), cv2.COLOR_BGR2RGBA)
    name = f"{c['imageId']}.rgba"
    data = rgb.tobytes()
    (a.out / name).write_bytes(data)
    left, top, right, bottom = c['expanded']
    x, y, w, h = c['bbox']
    expected = [{'id': i, 'x': point[0] + left, 'y': point[1] + top, 'score': point[2]} for i, point in enumerate(c['paddlePoints'])]
    cases.append({'id': c['id'], 'file': name, 'width': rgb.shape[1], 'height': rgb.shape[0], 'region': {'x': x, 'y': y, 'width': w, 'height': h}, 'crop': {'x': left, 'y': top, 'width': right - left, 'height': bottom - top}, 'sha256': hashlib.sha256(data).hexdigest(), 'expected': expected})
(a.out / 'cases.json').write_text(json.dumps(cases, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'已准备 {len(cases)} 个固定 RGBA/人体框验收样本。')
