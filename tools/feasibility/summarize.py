"""复算临时模型探针的 DARK 坐标；不把热力图测试等同于完整 SDK 验收。"""
import argparse
import hashlib
import json
import statistics
import sys
from pathlib import Path
import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--work', type=Path, required=True)
parser.add_argument('--upstream', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
sys.path.insert(0, str(args.upstream / 'deploy/python'))
from keypoint_postprocess import HRNetPostProcess

reference = json.loads((args.work / 'reference.json').read_text())
browser = json.loads((args.work / 'browser.json').read_text())
postprocess = HRNetPostProcess(use_dark=True)
cases = {c['id']: c for c in reference['cases']}
groups = []
for group in browser['results']:
    rows = []
    for record in group['rows']:
        case = cases[record['id']]
        path = args.work / 'browser' / f"{group['backend']}-{group['mode']}-{case['id']}.f32"
        binary = path.read_bytes()
        heatmap = np.frombuffer(binary, np.float32).reshape(1, 17, 64, 48).copy()
        size = np.array([case['cropSize']], np.float32)
        points = postprocess(heatmap, np.round(size / 2), size / 200)[0][0]
        paddle_points = np.array(case['paddlePoints'])
        errors = np.linalg.norm(points[:, :2] - paddle_points[:, :2], axis=1)
        reliable = paddle_points[:, 2] >= .2
        rows.append({'id': case['id'], 'heatmapSha256': hashlib.sha256(binary).hexdigest(), 'points': points.tolist(), 'maxErrorPx': float(errors.max()), 'maxReliableErrorPx': float(errors[reliable].max()) if reliable.any() else 0})
    group_summary = {'backend': group['backend'], 'mode': group['mode'], 'cases': len(rows), 'points': len(rows) * 17, 'maxAbsVsPythonOnnx': max(r['maxAbs'] for r in group['rows']), 'peaksMatched': sum(r['peaksMatch'] for r in group['rows']), 'maxErrorPxVsPaddle': max(r['maxErrorPx'] for r in rows), 'maxReliableErrorPxVsPaddle': max(r['maxReliableErrorPx'] for r in rows), 'medianWarmInferenceMs': statistics.median(statistics.median(r['inferenceMs']) for r in group['rows']), 'sessionMs': group['sessionMs'], 'adapter': group['adapter'], 'rows': rows}
    group_summary['parityPass'] = group_summary['maxAbsVsPythonOnnx'] <= 1e-4 and group_summary['maxReliableErrorPxVsPaddle'] <= .1
    groups.append(group_summary)
report = {'scope': '模型转换与同输入张量四组合浏览器数值一致性；非全量关键点 AP 或 SDK 图片路径验收', 'model': reference['model'], 'testedAt': browser['testedAt'], 'pythonSummary': reference['summary'], 'groups': groups}
args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
for g in groups:
    print(json.dumps({k:v for k,v in g.items() if k != 'rows'}, ensure_ascii=False))
if not all(g['parityPass'] for g in groups):
    raise SystemExit('存在不满足一致性门槛的组合')
