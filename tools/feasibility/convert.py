"""按已归档摘要获取官方部署 ZIP，并用固定 Paddle2ONNX 生成首个 FP32 候选。"""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--work', type=Path, required=True)
a = p.parse_args()
root = Path(__file__).resolve().parents[2]
lock = json.loads((root / 'reports/2026-09-16-feasibility/reference.json').read_text(encoding='utf-8'))
work = a.work.resolve()
work.mkdir(parents=True, exist_ok=True)


def verify(data, expected):
    if len(data) != expected['bytes'] or hashlib.sha256(data).hexdigest() != expected['sha256']:
        raise ValueError('下载或转换资产与固定字节数/SHA-256 不符')


archive = work / 'tinypose_256x192.zip'
if not archive.exists():
    with urllib.request.urlopen(lock['archiveUrl'], timeout=60) as response:
        data = response.read(lock['archive']['bytes'] + 1)
    verify(data, lock['archive'])
    archive.write_bytes(data)
verify(archive.read_bytes(), lock['archive'])
exported = work / 'exported/tinypose_256x192'
exported.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(archive) as z:
    for item in lock['paddleAssets']:
        data = z.read('tinypose_256x192/' + item['path'])
        verify(data, item)
        (exported / item['path']).write_bytes(data)
converter = Path(sys.executable).with_name('paddle2onnx.exe')
command = str(converter) if converter.exists() else shutil.which('paddle2onnx')
if not command:
    raise RuntimeError('请在固定 Paddle2ONNX 1.3.1 环境执行')
subprocess.run([command, '--model_dir', str(exported), '--model_filename', 'model.pdmodel', '--params_filename', 'model.pdiparams', '--opset_version', '17', '--save_file', str(work / 'tinypose-256x192-fp32.onnx')], check=True)
verify((work / 'tinypose-256x192-fp32.onnx').read_bytes(), lock['model'])
print('官方 ZIP、内部资产与重建 ONNX 摘要全部一致。')
