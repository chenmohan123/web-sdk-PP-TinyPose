"""TinyPose 变体转换与评测共用的不可变证据校验。"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


UPSTREAM_REVISION = "b25522a0f4bde8c80603f3ba5e3472059972e3b5"
UPSTREAM_FILES = {
    "configs/keypoint/tiny_pose/README.md": {
        "bytes": 22471,
        "sha256": "8593fc029f79462b1cebd34b4c61aeea7708cf18baf9e742e12377acd3523fc3",
    },
    "configs/keypoint/tiny_pose/tinypose_128x96.yml": {
        "bytes": 3245,
        "sha256": "b1c181d7f757a88a2abc73c663acfebae18f1fd88e4783c90fdb7c96ed3818ea",
    },
    "configs/keypoint/tiny_pose/tinypose_256x192.yml": {
        "bytes": 3189,
        "sha256": "fab0d5d5a43cb163393b39225ee54b2b9fe860e6f8b9d07cc39a8b1df6a81744",
    },
    "deploy/python/keypoint_preprocess.py": {
        "bytes": 8238,
        "sha256": "0bb7c833ca65105267adc2f083e1fe95ab645daa830358aff46cbb9f8948155c",
    },
    "deploy/python/keypoint_postprocess.py": {
        "bytes": 14967,
        "sha256": "2ccf000782204fa155ecbce1d022c8a90f424926b1bcf9497d1c153bcd382925",
    },
}


def bytes_identity(data: bytes) -> dict[str, Any]:
    """返回一段固定字节的长度与 SHA-256。"""
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def file_identity(path: Path) -> dict[str, Any]:
    """读取文件一次并返回长度与 SHA-256。"""
    return bytes_identity(path.read_bytes())


def verify_identity(actual: dict[str, Any], expected: dict[str, Any], label: str) -> None:
    """严格核对长度和 SHA-256。"""
    if actual["bytes"] != expected["bytes"] or actual["sha256"] != expected["sha256"]:
        raise ValueError(f"{label} 字节数或 SHA-256 与固定值不符")


def write_json(path: Path, value: Any) -> None:
    """以稳定 UTF-8/LF 格式写入 JSON。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write("\n")


def verify_upstream(upstream: Path, expected_files: dict[str, dict[str, Any]] = UPSTREAM_FILES) -> dict[str, Any]:
    """核对实际参与转换或评测的固定上游源码。"""
    root = upstream.resolve()
    files = []
    for relative_path, expected in expected_files.items():
        path = root / relative_path
        actual = file_identity(path)
        verify_identity(actual, expected, f"固定上游文件 {relative_path}")
        files.append({"path": relative_path, **actual})
    return {"revision": UPSTREAM_REVISION, "files": files}


def load_verified_candidates(
    manifest_path: Path,
) -> tuple[dict[str, dict[str, Any]], dict[str, bytes], dict[str, Any]]:
    """核对所有 prepared 候选，并保留同一份已验证字节供会话创建。"""
    manifest_path = manifest_path.resolve()
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    prepared = [item for item in manifest["models"] if item["status"] == "prepared"]
    ids = [item["id"] for item in prepared]
    if not prepared or len(ids) != len(set(ids)):
        raise ValueError("候选清单必须包含至少一个 ID 唯一的 prepared 候选")

    models: dict[str, dict[str, Any]] = {}
    verified_bytes: dict[str, bytes] = {}
    actual_models: dict[str, dict[str, Any]] = {}
    for item in prepared:
        model_id = item["id"]
        path = Path(item["absolutePath"]).resolve()
        data = path.read_bytes()
        actual = bytes_identity(data)
        verify_identity(actual, item, f"prepared 候选 {model_id}")
        models[model_id] = item
        verified_bytes[model_id] = data
        actual_models[model_id] = {"path": str(path), **actual}

    evidence = {
        "manifest": {"path": str(manifest_path), **bytes_identity(manifest_bytes)},
        "models": actual_models,
    }
    return models, verified_bytes, evidence


def validate_frozen_sample(image_ids: list[int], people: list[dict[str, Any]]) -> None:
    """强制固定样本为排序后的 64 张唯一图片与 110 个唯一人体。"""
    if len(image_ids) != 64:
        raise ValueError("冻结样本必须恰好包含 64 张请求图片")
    if len(set(image_ids)) != 64:
        raise ValueError("冻结样本的请求图片 ID 必须唯一")
    if image_ids != sorted(image_ids):
        raise ValueError("冻结样本的请求图片 ID 必须升序排列")

    person_ids = [(item["image_id"], item["id"]) for item in people]
    if len(person_ids) != 110:
        raise ValueError("冻结样本必须恰好包含 110 个有效人体")
    if len(set(person_ids)) != 110:
        raise ValueError("冻结样本的人体 (image_id, id) 必须唯一")
    if person_ids != sorted(person_ids):
        raise ValueError("冻结样本的人体 ID 必须按图片和标注编号升序排列")
    if not {image_id for image_id, _ in person_ids}.issubset(set(image_ids)):
        raise ValueError("冻结样本的人体必须属于请求图片")


def validate_or_create_lock(lock_path: Path, proposed: dict[str, Any]) -> dict[str, Any]:
    """仅首次创建评测锁；已有锁必须与当前全部输入完全一致。"""
    if lock_path.exists():
        locked = json.loads(lock_path.read_text(encoding="utf-8"))
        if locked != proposed:
            raise ValueError("当前输入与首次冻结评测锁不符，拒绝覆盖 evaluation-lock.json")
    else:
        write_json(lock_path, proposed)
    return {"path": str(lock_path.resolve()), **file_identity(lock_path)}
