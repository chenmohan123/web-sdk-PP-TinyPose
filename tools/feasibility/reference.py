"""临时可行性探针：固定单人裁剪，对照 Paddle 与 ONNX 热力图及 DARK 坐标。"""
import argparse
import hashlib
import json
import platform
import sys
import time
from collections import Counter
from pathlib import Path

import cv2
import numpy as np
import onnx
import onnxruntime as ort
import paddle
import paddle2onnx

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--work', type=Path, required=True)
parser.add_argument('--upstream', type=Path, required=True)
parser.add_argument('--dataset', type=Path, required=True)
args = parser.parse_args()
work = args.work.resolve()
sys.path.insert(0, str(args.upstream / 'deploy/python'))
from keypoint_preprocess import TopDownEvalAffine, expand_crop
from keypoint_postprocess import HRNetPostProcess


def identity(path):
    data = path.read_bytes()
    return {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')


model = work / 'tinypose-256x192-fp32.onnx'
graph = onnx.load(model)
onnx.checker.check_model(graph)
options = ort.SessionOptions()
options.intra_op_num_threads = 1
options.inter_op_num_threads = 1
session = ort.InferenceSession(str(model), sess_options=options, providers=['CPUExecutionProvider'])
exported = work / 'exported/tinypose_256x192'
config = paddle.inference.Config(str(exported / 'model.pdmodel'), str(exported / 'model.pdiparams'))
config.disable_gpu()
config.disable_glog_info()
config.set_cpu_math_library_num_threads(1)
predictor = paddle.inference.create_predictor(config)
annotations_path = args.dataset / 'instances_val2017.json'
annotations = json.loads(annotations_path.read_text(encoding='utf-8'))
image_info = {im['id']: im for im in annotations['images']}
selected = set(json.loads((args.dataset / 'selection.json').read_text())['imageIds'])
people = sorted([a for a in annotations['annotations'] if a['image_id'] in selected and a['category_id'] == 1 and not a['iscrowd'] and min(a['bbox'][2:]) >= 32], key=lambda a: (a['image_id'], a['id']))[:32]
cases = []
inputs = work / 'inputs'
inputs.mkdir(exist_ok=True)
postprocess = HRNetPostProcess(use_dark=True)
for index, ann in enumerate(people):
    meta = image_info[ann['image_id']]
    image_path = args.dataset / 'images' / meta['file_name']
    rgb = cv2.cvtColor(cv2.imread(str(image_path)), cv2.COLOR_BGR2RGB)
    x, y, width, height = ann['bbox']
    crop, expanded, original = expand_crop(rgb, np.array([0, 1, x, y, x + width, y + height]))
    h, w = crop.shape[:2]
    info = {'im_shape': np.array([h, w], dtype=np.float32)}
    warped, _ = TopDownEvalAffine([192, 256])(crop, info)
    normalized = (warped.astype(np.float32) / np.float32(255) - np.array([.485, .456, .406], np.float32)) / np.array([.229, .224, .225], np.float32)
    tensor = np.ascontiguousarray(normalized.transpose(2, 0, 1)[None])
    input_name = predictor.get_input_names()[0]
    handle = predictor.get_input_handle(input_name)
    handle.reshape(tensor.shape)
    handle.copy_from_cpu(tensor)
    start = time.perf_counter()
    predictor.run()
    paddle_ms = (time.perf_counter() - start) * 1000
    paddle_outputs = [predictor.get_output_handle(name).copy_to_cpu() for name in predictor.get_output_names()]
    heatmap = next(a for a in paddle_outputs if a.shape == (1, 17, 64, 48))
    start = time.perf_counter()
    converted = session.run(None, {'image': tensor})[0]
    ort_ms = (time.perf_counter() - start) * 1000
    if not np.isfinite(converted).all():
        raise ValueError('ONNX 输出包含非有限数值')
    center = np.round(np.array([[w, h]], np.float32) / 2)
    scale = np.array([[w, h]], np.float32) / 200
    paddle_points = postprocess(heatmap.copy(), center, scale)[0][0]
    onnx_points = postprocess(converted.copy(), center, scale)[0][0]
    difference = np.abs(converted - heatmap)
    error_px = np.linalg.norm(onnx_points[:, :2] - paddle_points[:, :2], axis=1)
    reliable = paddle_points[:, 2] >= .2
    tensor.tofile(inputs / f'{index}.input.f32')
    heatmap.tofile(inputs / f'{index}.paddle.f32')
    converted.tofile(inputs / f'{index}.onnx.f32')
    cv2.imwrite(str(inputs / f'{index}.crop.png'), cv2.cvtColor(crop, cv2.COLOR_RGB2BGR))
    cases.append({'id': index, 'imageId': ann['image_id'], 'annotationId': ann['id'], 'image': meta['file_name'], 'imageIdentity': identity(image_path), 'bbox': ann['bbox'], 'expanded': expanded, 'cropSize': [w, h], 'input': identity(inputs / f'{index}.input.f32'), 'paddleHeatmap': identity(inputs / f'{index}.paddle.f32'), 'onnxHeatmap': identity(inputs / f'{index}.onnx.f32'), 'maxAbs': float(difference.max()), 'meanAbs': float(difference.mean()), 'maxPointErrorPx': float(error_px.max()), 'reliablePoints': int(reliable.sum()), 'maxReliablePointErrorPx': float(error_px[reliable].max()) if reliable.any() else None, 'paddlePoints': paddle_points.tolist(), 'onnxPoints': onnx_points.tolist(), 'paddleMs': paddle_ms, 'onnxMs': ort_ms})

source_paths = ['LICENSE', 'configs/keypoint/tiny_pose/README.md', 'configs/keypoint/tiny_pose/tinypose_256x192.yml', 'deploy/python/keypoint_preprocess.py', 'deploy/python/keypoint_postprocess.py', 'deploy/python/keypoint_infer.py']
report = {'status': 'feasibility-only', 'upstreamRevision': 'b25522a0f4bde8c80603f3ba5e3472059972e3b5', 'model': identity(model), 'opset': [(o.domain, o.version) for o in graph.opset_import], 'operators': dict(Counter(n.op_type for n in graph.graph.node)), 'inputs': [{'name': t.name, 'shape': t.shape, 'type': t.type} for t in session.get_inputs()], 'outputs': [{'name': t.name, 'shape': t.shape, 'type': t.type} for t in session.get_outputs()], 'versions': {'python': sys.version, 'os': platform.platform(), 'paddle': paddle.__version__, 'paddle2onnx': paddle2onnx.__version__, 'onnx': onnx.__version__, 'onnxruntime': ort.__version__, 'numpy': np.__version__, 'opencv': cv2.__version__}, 'sources': [{'path': p, **identity(args.upstream / p)} for p in source_paths], 'archive': identity(work / 'tinypose_256x192.zip'), 'archiveUrl': 'https://bj.bcebos.com/v1/paddledet/models/keypoint/tinypose_enhance/tinypose_256x192.zip', 'paddleAssets': [{'path': p.name, **identity(p)} for p in exported.iterdir() if p.is_file()], 'annotations': identity(annotations_path), 'cases': cases, 'summary': {'cases': len(cases), 'maxAbs': max(c['maxAbs'] for c in cases), 'maxPointErrorPx': max(c['maxPointErrorPx'] for c in cases), 'maxReliablePointErrorPx': max(c['maxReliablePointErrorPx'] or 0 for c in cases)}}
write_json(work / 'reference.json', report)
print(json.dumps(report['summary'], ensure_ascii=False))
