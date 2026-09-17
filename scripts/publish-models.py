"""首版模型分发：准备、显式上传、固定提交完整回读；复用本机 Hub 登录。"""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import gzip
import hashlib
import json
import re
import shutil
import subprocess
import requests

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'reports/2026-09-17-release'
STAGE = ROOT / '.tmp/release-models'
REPO = 'chenmohan/web-sdk-pp-tinypose'
PREFIX = 'tinypose-256x192/0.1.0'
FILE = 'tinypose-256x192-fp32.onnx'
IDENTITY = {'bytes': 5685847, 'sha256': '7614d17acbe957200a8505e11a4fb8445103f9e44a7087115d8a1ea85f88b1b9'}


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')


def identity(data):
    return {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def now():
    return datetime.now(timezone.utc).isoformat()


def files(folder):
    return [{'path': f.relative_to(folder).as_posix(), **identity(f.read_bytes())}
            for f in sorted(folder.rglob('*')) if f.is_file()]


def head(source):
    if source == 'huggingface':
        from huggingface_hub import HfApi
        return HfApi().model_info(REPO).sha
    return subprocess.check_output(['git', '-c', 'http.sslBackend=openssl', 'ls-remote',
                                   f'https://www.modelscope.cn/{REPO}.git', 'refs/heads/master'], text=True).split()[0]


def address(source, revision, path):
    origin = 'https://www.modelscope.cn/models' if source == 'modelscope' else 'https://huggingface.co'
    return f'{origin}/{REPO}/resolve/{revision}/{path}'


def prepare():
    data = (ROOT / '.tmp/feasibility' / FILE).read_bytes()
    assert identity(data) == IDENTITY, '本地模型身份不符'
    old = ROOT / 'reports/2026-09-16-feasibility'
    ref = read(old / 'reference.json')
    assert ref['model'] == IDENTITY
    lock = read(old / 'upstream-lock.json')
    entry = next(x for x in lock['files'] if x['path'] == 'LICENSE')
    license_data = gzip.decompress((old / entry['snapshot']).read_bytes())
    assert identity(license_data) == {k: entry[k] for k in ('bytes', 'sha256')}
    product = ROOT / 'models' / PREFIX
    product.mkdir(parents=True, exist_ok=True)
    (product / 'LICENSE').write_bytes(license_data)
    (product / 'NOTICE').write_bytes((ROOT / 'NOTICE').read_bytes())
    conversion = {k: ref[k] for k in ('upstreamRevision', 'model', 'opset', 'inputs', 'outputs', 'versions', 'archiveUrl', 'archive', 'paddleAssets')}
    conversion.update({'version': '0.1.0', 'graphModification': '无；Paddle2ONNX 1.3.1 opset17 原样转换',
                       'reproduction': 'tools/feasibility/convert.py', 'reference': 'reports/2026-09-16-feasibility'})
    dump(product / 'conversion.json', conversion)
    card = f'''# PP-TinyPose 256×192 FP32

[English](README.en.md)

本镜像由 chenmohan 维护，来源于 PaddleDetection 官方增强版 TinyPose；并非官方账号。
版本 0.1.0。模型 {IDENTITY['bytes']} 字节，SHA-256 `{IDENTITY['sha256']}`，opset 17。

上游固定提交 `{lock['revision']}`；官方部署 ZIP：{ref['archiveUrl']}。
源码为 Apache-2.0，完整原文见 LICENSE，归因见 NOTICE。官方 ZIP 没有独立权重许可证；本镜像如实记录官方模型发布归属及仓库许可，不推断额外授权。
Paddle2ONNX 1.3.1 转换，不修改图或权重，原 ZIP/内部文件摘要及工具版本见 conversion.json。

输入单个人体 RGB float32 NCHW [1,3,256,192]，/255、mean [0.485,0.456,0.406]、std [0.229,0.224,0.225]。
模型输出 [1,17,64,48] 热力图及 argmax；SDK 按官方 expand_crop 扩30%、TopDownEvalAffine、DARK还原原图 COCO 17 点。
score 为未校准热力图响应，可能小于0或大于1，不是可见性概率。

2026-09-16/17 已有 Windows 11、Chromium 153.0.8010.12、ORT Web 1.27.0 的 CPU/GPU × main/worker 桌面数值与生命周期证据。
32 个固定裁剪用于数值一致性，非全量 AP。官方 GT 框 AP 68.3 为上游引用，未重测。
不包含自动多人检测、视频跟踪、FP16、NPU；移动端未验收。

SDK、重建脚本与证据：https://github.com/chenmohan123/web-sdk-PP-TinyPose
模型按固定提交从 ModelScope/Hugging Face 分发，默认 ModelScope；显式来源失败不静默换源。npm 不包含 ONNX。
'''
    english = f'''# PP-TinyPose 256×192 FP32

[中文](README.md)

This mirror is maintained by chenmohan, not the official PaddleDetection account. It contains the official enhanced TinyPose model.
Version 0.1.0; {IDENTITY['bytes']} bytes; SHA-256 `{IDENTITY['sha256']}`; ONNX opset 17.
Pinned upstream commit `{lock['revision']}`. Official deployment archive: {ref['archiveUrl']}.

The upstream repository uses Apache-2.0 (see LICENSE and NOTICE). The deployment ZIP contains no separate weight license. This mirror records that fact and the official publication provenance without inferring additional permission.
Converted with Paddle2ONNX 1.3.1, with no graph or weight changes. See conversion.json for archive/internal hashes and tool versions.

Input: a single person, RGB float32 NCHW [1,3,256,192], divided by 255 and normalized with mean [0.485,0.456,0.406] and std [0.229,0.224,0.225].
Outputs: [1,17,64,48] heatmaps and auxiliary argmax. The SDK uses upstream 30% expand_crop, TopDownEvalAffine and DARK to produce 17 COCO keypoints in original-image coordinates.
Scores are uncalibrated heatmap responses, may be below zero or above one, and are not visibility probabilities.

Dated evidence (2026-09-16/17): Windows 11, Chromium 153.0.8010.12, ORT Web 1.27.0, CPU/GPU × main/worker numeric and lifecycle checks.
The 32 fixed crops test numerical consistency, not full-dataset AP. The upstream GT-box AP 68.3 is quoted, not remeasured.
No automatic multi-person detection, video tracking, FP16, or NPU. Mobile devices remain unverified.

SDK, reproduction scripts and evidence: https://github.com/chenmohan123/web-sdk-PP-TinyPose
ModelScope and Hugging Face use immutable revisions. ModelScope is the default; explicit source failure never silently switches sources. npm contains no ONNX weights.
'''
    (product / 'README.md').write_text(card, encoding='utf-8')
    (product / 'README.en.md').write_text(english, encoding='utf-8')
    target = STAGE / 'weights' / PREFIX
    target.mkdir(parents=True, exist_ok=True)
    for name in ('LICENSE', 'NOTICE', 'conversion.json', 'README.md', 'README.en.md'):
        shutil.copyfile(product / name, target / name)
    (target / FILE).write_bytes(data)
    root_card = f'''---
license: apache-2.0
pipeline_tag: keypoint-detection
tags:
- onnx
- webgpu
- wasm
---

# PP-TinyPose Web SDK 模型

[中文模型卡]({PREFIX}/README.md) · [English model card]({PREFIX}/README.en.md)

官方增强版 256×192 FP32，版本 0.1.0，{IDENTITY['bytes']} 字节。
仅提供单人图或外部人体框的 17 点姿态估计。桌面 CPU/GPU 已有验收；不声明手机或 NPU 兼容。
The enhanced 256×192 FP32 model estimates 17 keypoints for one person or a caller-provided crop. Desktop CPU/GPU evidence is available; mobile and NPU are unverified.

上游仓库 Apache-2.0；ZIP 没有独立权重许可。完整来源、限制、许可及摘要见模型卡。
Upstream uses Apache-2.0; the ZIP has no separate weight license. See the model card for provenance, limitations and hashes.
'''
    (STAGE / 'weights/README.md').write_text(root_card, encoding='utf-8')
    dump(REPORT / 'distribution-prepared.json', {'preparedAt': now(), 'repository': REPO, 'model': IDENTITY, 'files': files(STAGE / 'weights')})
    print('权重、许可、双语模型卡和转换记录已准备并核验。')


def upload(source, phase):
    folder = STAGE / phase
    receipt = REPORT / f'distribution-{phase}-{source}.json'
    expected = files(folder)
    assert expected, '暂存为空'
    if receipt.exists():
        previous = read(receipt)
        assert previous['files'] == expected, '已上传文件身份改变'
        print(source, phase, '已有固定回执，跳过重复上传')
        return
    if phase == 'weights':
        assert expected == read(REPORT / 'distribution-prepared.json')['files']
    if source == 'huggingface':
        from huggingface_hub import HfApi
        api = HfApi()
        if phase == 'weights':
            api.create_repo(repo_id=REPO, repo_type='model', private=False, exist_ok=False)
        parent = head(source)
        rev = api.upload_folder(repo_id=REPO, repo_type='model', folder_path=str(folder), parent_commit=parent,
                                commit_message=f'发布 TinyPose 0.1.0：{phase}', delete_patterns=None).oid
    else:
        from modelscope.hub.api import HubApi
        api = HubApi()
        if phase == 'weights':
            api.create_repo(REPO, repo_type='model', visibility=5, license='Apache License 2.0', exist_ok=False)
        parent = head(source)
        assert head(source) == parent, '远程 HEAD 已改变'
        api.upload_folder(repo_id=REPO, repo_type='model', folder_path=str(folder),
                          commit_message=f'发布 TinyPose 0.1.0：{phase}', sync_remote_repo=False,
                          max_workers=1, disable_tqdm=True, use_cache=False)
        rev = head(source)
    assert re.fullmatch('[a-f0-9]{40}', rev), '远程 revision 无效'
    dump(receipt, {'source': source, 'repository': REPO, 'phase': phase, 'parent': parent, 'revision': rev,
                   'uploadedAt': now(), 'files': expected})
    print(source, phase, rev)


def verify(phase):
    rows = []
    for source in ('modelscope', 'huggingface'):
        receipt = read(REPORT / f'distribution-{phase}-{source}.json')
        assert receipt['files'] == files(STAGE / phase), '本地暂存文件集合改变'
        for f in receipt['files']:
            url = address(source, receipt['revision'], f['path'])
            with requests.get(url, timeout=(30, 120)) as response:
                response.raise_for_status()
                actual = identity(response.content)
            assert actual == {k: f[k] for k in ('bytes', 'sha256')}, '远程文件大小或摘要不符：' + f['path']
            rows.append({'source': source, 'revision': receipt['revision'], 'url': url,
                         **f, 'verifiedAt': now(), 'passed': True})
    dump(REPORT / f'distribution-{phase}-verified.json', {'status': 'passed', 'model': IDENTITY, 'verifiedAt': now(), 'results': rows})
    if phase == 'weights':
        sources = []
        for source in ('modelscope', 'huggingface'):
            receipt = read(REPORT / f'distribution-{phase}-{source}.json')
            sources.append({'kind': source, 'repository': REPO, 'revision': receipt['revision'], 'path': PREFIX + '/' + FILE,
                            'downloadUrl': address(source, receipt['revision'], PREFIX + '/' + FILE), **IDENTITY})
        manifest = {'id': 'tinypose-enhance-256x192', 'version': '0.1.0', 'url': sources[0]['downloadUrl'],
                    **IDENTITY, 'defaultSource': 'modelscope', 'sources': sources}
        dump(ROOT / 'models/model.json', manifest)
        dump(ROOT / 'models' / PREFIX / 'manifest.json', manifest)
        dump(STAGE / 'metadata' / PREFIX / 'manifest.json', manifest)
    print(phase, '双源全部文件完整 GET 校验通过。')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'upload', 'verify'])
    parser.add_argument('--source', choices=['modelscope', 'huggingface'])
    parser.add_argument('--phase', choices=['weights', 'metadata'], default='weights')
    args = parser.parse_args()
    if args.action == 'prepare': prepare()
    elif args.action == 'verify': verify(args.phase)
    else:
        assert args.source, '上传需要显式指定来源'
        upload(args.source, args.phase)
