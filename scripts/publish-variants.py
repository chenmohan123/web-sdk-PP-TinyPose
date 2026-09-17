"""TinyPose 0.2.0 新变体分发：准备、显式上传、完整回读与清单生成。"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import argparse
import hashlib
import json
import re
import shutil
import subprocess

import requests


ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reports/2026-09-17-variants"
STAGE = ROOT / ".tmp/variants-distribution"
REPO = "chenmohan/web-sdk-pp-tinypose"
EXPECTED_PARENT = {
    "modelscope": "ddd1bc0b0b207040b63db3453f6edec30ae3eacc",
    "huggingface": "9d291aea6c61b738ebb4ef22b23bdfb80149ff04",
}
NEW_MODELS = (
    {
        "id": "tinypose-enhance-128x96",
        "version": "0.2.0",
        "precision": "fp32",
        "inputSize": {"width": 96, "height": 128},
        "bytes": 5_685_846,
        "sha256": "a0e2edd5272f48243a9cbd571151eda966f1bfa865a954f39e1e344aa5a14cf8",
        "candidate": ".tmp/variants/models/tinypose-enhance-128x96-fp32.onnx",
        "prefix": "tinypose-128x96/0.2.0/fp32",
        "file": "tinypose-128x96-fp32.onnx",
    },
    {
        "id": "tinypose-enhance-128x96-w16a32",
        "version": "0.2.0",
        "precision": "w16a32",
        "inputSize": {"width": 96, "height": 128},
        "bytes": 3_150_847,
        "sha256": "8671c7b424d85d4f017b6410602de6095b1fbb9fffca38ad5489039dd2a0cfea",
        "candidate": ".tmp/variants/models/tinypose-enhance-128x96-w16a32.onnx",
        "prefix": "tinypose-128x96/0.2.0/w16a32",
        "file": "tinypose-128x96-w16a32.onnx",
    },
)


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def dump(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value.rstrip() + "\n", encoding="utf-8", newline="\n")


def identity(data: bytes):
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def now():
    return datetime.now(timezone.utc).isoformat()


def files(folder: Path):
    return [
        {"path": path.relative_to(folder).as_posix(), **identity(path.read_bytes())}
        for path in sorted(folder.rglob("*"))
        if path.is_file()
    ]


def head(source: str):
    if source == "huggingface":
        from huggingface_hub import HfApi

        return HfApi().model_info(REPO).sha
    return subprocess.check_output(
        [
            "git",
            "-c",
            "http.sslBackend=openssl",
            "ls-remote",
            f"https://www.modelscope.cn/{REPO}.git",
            "refs/heads/master",
        ],
        text=True,
    ).split()[0]


def address(source: str, revision: str, path: str):
    origin = (
        "https://www.modelscope.cn/models"
        if source == "modelscope"
        else "https://huggingface.co"
    )
    return f"{origin}/{REPO}/resolve/{revision}/{path}"


def assert_candidates_and_browser() -> None:
    candidates = load(ROOT / ".tmp/variants/candidates.json")
    by_id = {item["id"]: item for item in candidates["models"]}
    for spec in NEW_MODELS:
        candidate = by_id[spec["id"]]
        assert candidate["status"] == "prepared"
        for key in ("precision", "inputSize", "bytes", "sha256"):
            assert candidate[key] == spec[key], f"候选 {spec['id']} 的 {key} 不一致"
        data = (ROOT / spec["candidate"]).read_bytes()
        assert identity(data) == {key: spec[key] for key in ("bytes", "sha256")}

    report = load(REPORT / "browser-comparison.json")
    assert report["status"] == "passed"
    for binding in report["bindings"].values():
        actual = identity((ROOT / binding["path"]).read_bytes())
        assert actual == {key: binding[key] for key in ("bytes", "sha256")}, (
            f"浏览器报告绑定文件已改变：{binding['path']}"
        )
    browser_candidates = {item["id"]: item for item in report["candidates"]}
    for model_id in ("tinypose-enhance-128x96", "tinypose-enhance-256x192", "tinypose-enhance-128x96-w16a32"):
        candidate = by_id[model_id]
        browser_candidate = browser_candidates[model_id]
        assert browser_candidate["precision"] == candidate["precision"]
        assert browser_candidate["inputSize"] == candidate["inputSize"]
        assert browser_candidate["model"] == {
            "path": candidate["path"],
            "bytes": candidate["bytes"],
            "sha256": candidate["sha256"],
        }
    for asset in report["sdk"]["assets"]:
        actual = identity((ROOT / asset["path"]).read_bytes())
        assert actual == {key: asset[key] for key in ("bytes", "sha256")}, (
            f"浏览器报告 SDK 资产已改变：{asset['path']}"
        )
    qualified = {item["id"] for item in NEW_MODELS} | {"tinypose-enhance-256x192"}
    expected = {
        (model_id, backend, mode)
        for model_id in qualified
        for backend in ("wasm", "webgpu")
        for mode in ("main", "worker")
    }
    actual = set()
    for row in report["matrix"]:
        key = (row["modelId"], row["backend"], row["mode"])
        assert key in expected, f"浏览器矩阵含未知组合：{key}"
        assert key not in actual, f"浏览器矩阵组合重复：{key}"
        assert row["status"] == "passed", f"浏览器矩阵未通过：{key}"
        actual.add(key)
    assert actual == expected, "浏览器矩阵缺项"


def conversion_record(spec):
    preparation = load(REPORT / "preparation.json")
    candidate = next(
        item for item in load(ROOT / ".tmp/variants/candidates.json")["models"]
        if item["id"] == spec["id"]
    )
    record = {
        "version": spec["version"],
        "upstreamRevision": preparation["upstreamRevision"],
        "archive": preparation["archive128"],
        "paddleAssets": preparation["paddleAssets128"],
        "model": {key: spec[key] for key in ("bytes", "sha256")},
        "opset": 17,
        "input": [1, 3, 128, 96],
        "output": [1, 17, 32, 24],
        "parameterCount": None,
        "tools": preparation["tools"],
        "reproduction": "tools/variants/prepare.py",
        "evidence": "reports/2026-09-17-variants",
    }
    if spec["precision"] == "fp32":
        record["graphModification"] = "无；Paddle2ONNX 1.3.1 opset 17 原样转换"
    else:
        record["graphModification"] = candidate["conversion"]
    return record


def cards(spec):
    precision_zh = "FP32" if spec["precision"] == "fp32" else "FP16 权重（FP32 计算）"
    precision_en = "FP32" if spec["precision"] == "fp32" else "FP16 weights (FP32 compute)"
    modification_zh = "转换图未修改。" if spec["precision"] == "fp32" else (
        "270 个直接供给 Conv 的常量权重以 FP16 保存，并在 Conv 前显式 Cast 回 FP32；"
        "激活、算子和输入输出均为 FP32。"
    )
    modification_en = "The converted graph is unchanged." if spec["precision"] == "fp32" else (
        "270 constant weights consumed by Conv are stored as FP16 and explicitly cast back to FP32 before Conv; "
        "activations, operators, inputs and outputs remain FP32."
    )
    zh = f"""# PP-TinyPose 128×96 {precision_zh}

[English](README.en.md)

本镜像由 chenmohan 维护，来源于 PaddleDetection 官方增强版 TinyPose；并非官方账号。
版本 {spec['version']}，模型 {spec['bytes']} 字节，SHA-256 `{spec['sha256']}`，ONNX opset 17；官方报告约 1.32M 参数，当前分发清单不填未经独立证明的精确参数量。

上游固定提交 `b25522a0f4bde8c80603f3ba5e3472059972e3b5`；官方部署 ZIP：https://bj.bcebos.com/v1/paddledet/models/keypoint/tinypose_enhance/tinypose_128x96.zip 。
源码为 Apache-2.0，完整原文见 LICENSE，归因见 NOTICE。官方 ZIP 没有独立权重许可证；本镜像如实记录官方模型发布归属及仓库许可，不推断额外授权。
{modification_zh} 固定 ZIP、内部文件、ONNX 和工具摘要见 conversion.json。

输入单个人体 RGB float32 NCHW `[1,3,128,96]`；输出 `[1,17,32,24]` 热力图与 argmax。SDK 使用上游扩框、TopDownEvalAffine 和 DARK 还原原图 COCO 17 点。score 是未校准热力图响应，不是可见性概率。

2026-09-17 固定 64 图、110 人 GT 框子集平均 OKS 为 `{'0.727050' if spec['precision'] == 'fp32' else '0.727106'}`，不是 COCO 全量 AP。桌面 Chromium 153、Windows 11、ORT Web 1.27.0 的 WASM/WebGPU × main/worker 已通过。W16A32 相对同规格 FP32 体积减少 44.584%，不宣称加速或 FP16 计算。性能仅是固定设备观测。

不包含自动多人检测、视频跟踪或 NPU；手机未验收。SDK、重建脚本与证据：https://github.com/chenmohan123/web-sdk-PP-TinyPose
模型按固定提交从 ModelScope/Hugging Face 分发，默认 ModelScope；显式来源失败不静默换源。npm 不包含 ONNX。
"""
    en = f"""# PP-TinyPose 128×96 {precision_en}

[中文](README.md)

This mirror is maintained by chenmohan, not the official PaddleDetection account. It contains the official enhanced TinyPose model.
Version {spec['version']}; {spec['bytes']} bytes; SHA-256 `{spec['sha256']}`; ONNX opset 17. The official report states about 1.32M parameters; distribution metadata leaves the exact count unset because it has not been independently established.

Pinned upstream commit `b25522a0f4bde8c80603f3ba5e3472059972e3b5`. Official deployment archive: https://bj.bcebos.com/v1/paddledet/models/keypoint/tinypose_enhance/tinypose_128x96.zip .
The upstream repository uses Apache-2.0 (see LICENSE and NOTICE). The ZIP contains no separate weight license. This mirror records the official provenance and repository license without inferring additional permission.
{modification_en} See conversion.json for pinned ZIP, internal file, ONNX and tool hashes.

Input is one person as RGB float32 NCHW `[1,3,128,96]`; outputs are `[1,17,32,24]` heatmaps and argmax. The SDK applies upstream crop expansion, TopDownEvalAffine and DARK to return 17 COCO keypoints in original-image coordinates. Scores are uncalibrated heatmap responses, not visibility probabilities.

On the fixed 64-image, 110-person GT-box subset dated 2026-09-17, mean OKS was `{'0.727050' if spec['precision'] == 'fp32' else '0.727106'}`; this is not full COCO AP. WASM/WebGPU × main/worker passed on desktop Chromium 153, Windows 11 and ORT Web 1.27.0. W16A32 reduced model bytes by 44.584% against same-size FP32; it does not claim faster execution or FP16 compute. Timings are observations from the fixed device only.

Automatic multi-person detection, video tracking and NPU are outside scope; mobile is unverified. SDK, reproduction and evidence: https://github.com/chenmohan123/web-sdk-PP-TinyPose
ModelScope and Hugging Face use immutable revisions. ModelScope is the default; an explicit source failure never switches sources. npm contains no ONNX weights.
"""
    return zh, en


def root_card():
    return """---
license: apache-2.0
pipeline_tag: keypoint-detection
tags:
- onnx
- webgpu
- wasm
---

# PP-TinyPose Web SDK 模型

稳定清单包含三个通过项：

- [256×192 FP32 0.1.0](tinypose-256x192/0.1.0/README.md)（默认）
- [128×96 FP32 0.2.0](tinypose-128x96/0.2.0/fp32/README.md)
- [128×96 FP16 权重（FP32 计算）0.2.0](tinypose-128x96/0.2.0/w16a32/README.md)

English cards are linked from each entry. All three passed the dated desktop WASM/WebGPU × main/worker checks. The 64-image GT-box subset reports mean OKS rather than full COCO AP. Mobile and NPU remain unverified.

上游仓库采用 Apache-2.0；官方 ZIP 没有独立权重许可。W16A32 仅压缩权重存储，不声明 FP16 计算或加速。完整来源、修改、限制、许可与摘要见各模型卡。
"""


def prepare():
    assert_candidates_and_browser()
    if STAGE.exists():
        shutil.rmtree(STAGE)
    weight_stage = STAGE / "weights"
    write_text(weight_stage / "README.md", root_card())
    notice = (ROOT / "NOTICE").read_bytes()
    license_data = (ROOT / "LICENSE").read_bytes()
    for spec in NEW_MODELS:
        product = ROOT / "models" / spec["prefix"]
        product.mkdir(parents=True, exist_ok=True)
        zh, en = cards(spec)
        write_text(product / "README.md", zh)
        write_text(product / "README.en.md", en)
        dump(product / "conversion.json", conversion_record(spec))
        (product / "LICENSE").write_bytes(license_data)
        (product / "NOTICE").write_bytes(notice)
        target = weight_stage / spec["prefix"]
        target.mkdir(parents=True, exist_ok=True)
        for name in ("README.md", "README.en.md", "conversion.json", "LICENSE", "NOTICE"):
            shutil.copyfile(product / name, target / name)
        shutil.copyfile(ROOT / spec["candidate"], target / spec["file"])
    prepared = {
        "schemaVersion": 2,
        "preparedAt": now(),
        "repository": REPO,
        "expectedParents": EXPECTED_PARENT,
        "models": [
            {key: spec[key] for key in ("id", "version", "precision", "inputSize", "bytes", "sha256", "prefix", "file")}
            for spec in NEW_MODELS
        ],
        "files": files(weight_stage),
    }
    dump(REPORT / "distribution-variants-prepared.json", prepared)
    print(f"变体分发暂存已准备：{len(prepared['files'])} 个文件。")


def upload(source: str, phase: str):
    folder = STAGE / phase
    expected = files(folder)
    assert expected, "暂存为空"
    if phase == "weights":
        assert expected == load(REPORT / "distribution-variants-prepared.json")["files"], (
            "weights 暂存与已审阅 prepared.files 不一致"
        )
    receipt = REPORT / f"distribution-variants-{phase}-{source}.json"
    if receipt.exists():
        previous = load(receipt)
        assert previous["files"] == expected, "已有上传回执与当前暂存身份不同"
        print(f"{source} {phase} 已有回执，未重复上传。")
        return
    parent = head(source)
    expected_parent = EXPECTED_PARENT[source] if phase == "weights" else load(
        REPORT / f"distribution-variants-weights-{source}.json"
    )["revision"]
    assert parent == expected_parent, f"{source} HEAD 已改变：期望 {expected_parent}，实际 {parent}"
    assert head(source) == parent, f"{source} 上传前 HEAD 发生变化"
    if source == "huggingface":
        from huggingface_hub import HfApi

        result = HfApi().upload_folder(
            repo_id=REPO,
            repo_type="model",
            folder_path=str(folder),
            parent_commit=parent,
            commit_message=f"发布 TinyPose 0.2.0 {phase}",
            delete_patterns=None,
        )
        revision = result.oid
    else:
        from modelscope.hub.api import HubApi

        HubApi().upload_folder(
            repo_id=REPO,
            repo_type="model",
            folder_path=str(folder),
            commit_message=f"发布 TinyPose 0.2.0 {phase}",
            sync_remote_repo=False,
            max_workers=1,
            disable_tqdm=True,
            use_cache=False,
        )
        revision = head(source)
    assert re.fullmatch(r"[a-f0-9]{40}", revision), "远程 revision 无效"
    dump(
        receipt,
        {
            "source": source,
            "repository": REPO,
            "phase": phase,
            "parent": parent,
            "revision": revision,
            "uploadedAt": now(),
            "files": expected,
        },
    )
    print(f"{source} {phase} 上传完成：{revision}")


def source_entry(source: str, revision: str, spec):
    path = f"{spec['prefix']}/{spec['file']}"
    return {
        "kind": source,
        "repository": REPO,
        "revision": revision,
        "path": path,
        "downloadUrl": address(source, revision, path),
        "bytes": spec["bytes"],
        "sha256": spec["sha256"],
    }


def complete_model(spec, revisions):
    sources = [source_entry(source, revisions[source], spec) for source in ("modelscope", "huggingface")]
    return {
        "id": spec["id"],
        "version": spec["version"],
        "url": sources[0]["downloadUrl"],
        "bytes": spec["bytes"],
        "sha256": spec["sha256"],
        "defaultSource": "modelscope",
        "sources": sources,
        "inputSize": spec["inputSize"],
        "precision": spec["precision"],
        "backends": ["wasm", "webgpu"],
        "parameterCount": None,
    }


def build_catalog(revisions):
    legacy = load(ROOT / "models/model.json")
    legacy.update(
        {
            "inputSize": {"width": 192, "height": 256},
            "precision": "fp32",
            "backends": ["wasm", "webgpu"],
            "parameterCount": None,
        }
    )
    models = [legacy, *(complete_model(spec, revisions) for spec in NEW_MODELS)]
    catalog = {"schemaVersion": 1, "defaultModelId": legacy["id"], "models": models}
    dump(ROOT / "models/catalog.json", catalog)
    dump(ROOT / "models/model.json", legacy)
    metadata_stage = STAGE / "metadata"
    if metadata_stage.exists():
        shutil.rmtree(metadata_stage)
    dump(metadata_stage / "catalog.json", catalog)
    for model, spec in zip(models[1:], NEW_MODELS):
        dump(ROOT / "models" / spec["prefix"] / "manifest.json", model)
        dump(metadata_stage / spec["prefix"] / "manifest.json", model)
    return catalog


def verify(phase: str):
    receipts = {
        source: load(REPORT / f"distribution-variants-{phase}-{source}.json")
        for source in ("modelscope", "huggingface")
    }
    rows = []
    for source, receipt in receipts.items():
        assert receipt["files"] == files(STAGE / phase), "本地暂存文件集合已改变"
        for item in receipt["files"]:
            url = address(source, receipt["revision"], item["path"])
            with requests.get(url, timeout=(30, 180)) as response:
                response.raise_for_status()
                actual = identity(response.content)
            assert actual == {key: item[key] for key in ("bytes", "sha256")}, (
                f"远程文件身份不符：{source}/{item['path']}"
            )
            rows.append(
                {
                    "source": source,
                    "revision": receipt["revision"],
                    "url": url,
                    **item,
                    "verifiedAt": now(),
                    "passed": True,
                }
            )
    report = {
        "schemaVersion": 2,
        "status": "passed",
        "phase": phase,
        "verifiedAt": now(),
        "parents": {source: receipt["parent"] for source, receipt in receipts.items()},
        "revisions": {source: receipt["revision"] for source, receipt in receipts.items()},
        "results": rows,
    }
    if phase == "weights":
        report["catalog"] = build_catalog(report["revisions"])
    else:
        weight_report = load(REPORT / "distribution-variants-weights-verified.json")
        catalog = load(ROOT / "models/catalog.json")
        weight_rows = []
        for model in catalog["models"]:
            for source in model["sources"]:
                with requests.get(source["downloadUrl"], timeout=(30, 180)) as response:
                    response.raise_for_status()
                    actual = identity(response.content)
                assert actual == {key: model[key] for key in ("bytes", "sha256")}
                weight_rows.append(
                    {
                        "modelId": model["id"],
                        "source": source["kind"],
                        "revision": source["revision"],
                        "url": source["downloadUrl"],
                        "path": source["path"],
                        **actual,
                        "verifiedAt": now(),
                        "passed": True,
                    }
                )
        report["weightRevisions"] = weight_report["revisions"]
        report["catalog"] = catalog
        dump(
            REPORT / "distribution-variants-verified.json",
            {
                "schemaVersion": 2,
                "status": "passed",
                "verifiedAt": now(),
                "catalog": catalog,
                "weights": weight_report,
                "metadata": {
                    "parents": report["parents"],
                    "revisions": report["revisions"],
                    "results": rows,
                },
                "results": weight_rows,
                "modelscopeConcurrencyLimit": "ModelScope 不提供 parent_commit CAS；上传前连续两次 HEAD 检查，上传后固定 revision 完整 GET。",
            },
        )
    dump(REPORT / f"distribution-variants-{phase}-verified.json", report)
    print(f"{phase} 双源全部文件完整 GET 与逐字节摘要核对通过。")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("prepare", "upload", "verify"))
    parser.add_argument("--source", choices=("modelscope", "huggingface"))
    parser.add_argument("--phase", choices=("weights", "metadata"), default="weights")
    args = parser.parse_args()
    if args.action == "prepare":
        prepare()
    elif args.action == "verify":
        verify(args.phase)
    else:
        assert args.source, "上传需要显式指定来源"
        upload(args.source, args.phase)
