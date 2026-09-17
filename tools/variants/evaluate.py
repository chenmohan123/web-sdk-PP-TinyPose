"""评测 TinyPose ONNX 候选的转换一致性、固定子集 OKS 与 FP16 偏差。"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
import zipfile
from pathlib import Path
from typing import Any

import numpy as np


COCO_KEYPOINT_SIGMAS = np.array(
    [.26, .25, .25, .35, .35, .79, .79, .72, .72, .62, .62, 1.07, 1.07, .87, .87, .89, .89],
    dtype=np.float64,
) / 10.0
KEYPOINT_ARCHIVE = {
    "url": "http://images.cocodataset.org/annotations/annotations_trainval2017.zip",
    "bytes": 252907541,
    "sha256": "113a836d90195ee1f884e704da6304dfaaecff1f023f49b6ca93c4aaae470268",
    "member": "annotations/person_keypoints_val2017.json",
}
PARITY_THRESHOLDS = {"maxHeatmapAbs": 0.0001, "maxReliablePointErrorPx": 0.5}
FP16_THRESHOLDS = {
    "maxMeanOksDrop": 0.005,
    "maxPersonOksDrop": 0.05,
    "reliablePointErrorP95Px": 1.0,
    "maxReliablePointErrorPx": 5.0,
}


def compute_oks(prediction: np.ndarray, ground_truth: np.ndarray, area: float) -> float:
    """按 COCO sigma 与 segmentation area 计算单人 OKS。"""
    prediction = np.asarray(prediction, dtype=np.float64)
    ground_truth = np.asarray(ground_truth, dtype=np.float64)
    if prediction.shape != (17, 2) or ground_truth.shape != (17, 3):
        raise ValueError("关键点形状必须分别为 (17, 2) 与 (17, 3)")
    if not np.isfinite(prediction).all() or not np.isfinite(ground_truth).all():
        raise ValueError("关键点必须全部为有限数值")
    if not np.isfinite(area) or area <= 0:
        raise ValueError("segmentation area 必须是正数")
    visible = ground_truth[:, 2] > 0
    if not visible.any():
        raise ValueError("至少需要一个可见关键点")
    squared_distance = np.square(prediction[:, 0] - ground_truth[:, 0]) + np.square(
        prediction[:, 1] - ground_truth[:, 1]
    )
    variances = np.square(COCO_KEYPOINT_SIGMAS * 2.0)
    errors = squared_distance / variances / area / 2.0
    return float(np.exp(-errors[visible]).mean())


def select_people(annotations: list[dict[str, Any]], image_ids: set[int]) -> list[dict[str, Any]]:
    """固定筛选评测人体，不按模型输出筛样本。"""
    return sorted(
        [
            item
            for item in annotations
            if item["image_id"] in image_ids
            and item.get("category_id", 1) == 1
            and not item["iscrowd"]
            and min(item["bbox"][2:]) >= 32
            and item["num_keypoints"] > 0
        ],
        key=lambda item: (item["image_id"], item["id"]),
    )


def identity(path: Path) -> dict[str, Any]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            size += len(chunk)
            digest.update(chunk)
    return {"bytes": size, "sha256": digest.hexdigest()}


def bytes_identity(data: bytes) -> dict[str, Any]:
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def _verify_identity(actual: dict[str, Any], expected: dict[str, Any], label: str) -> None:
    if actual["bytes"] != expected["bytes"] or actual["sha256"] != expected["sha256"]:
        raise ValueError(f"{label} 字节数或 SHA-256 与固定值不符")


def _load_keypoints(archive_path: Path, output_path: Path) -> dict[str, Any]:
    _verify_identity(identity(archive_path), KEYPOINT_ARCHIVE, "COCO 标注 ZIP")
    with zipfile.ZipFile(archive_path) as archive:
        raw = archive.read(KEYPOINT_ARCHIVE["member"])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(raw)
    return json.loads(raw)


def _summarize_oks(values: list[float]) -> dict[str, Any]:
    array = np.asarray(values, dtype=np.float64)
    return {
        "people": len(values),
        "meanOks": float(array.mean()),
        "oksAt50Ratio": float((array >= .5).mean()),
        "oksAt75Ratio": float((array >= .75).mean()),
    }


def _model_session(path: Path):
    import onnxruntime as ort

    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    options.log_severity_level = 3
    return ort.InferenceSession(str(path), sess_options=options, providers=["CPUExecutionProvider"])


def _paddle_predictor(exported: Path):
    import paddle

    config = paddle.inference.Config(str(exported / "model.pdmodel"), str(exported / "model.pdiparams"))
    config.disable_gpu()
    config.disable_glog_info()
    config.set_cpu_math_library_num_threads(1)
    return paddle.inference.create_predictor(config)


def _preprocess(rgb: np.ndarray, bbox: list[float], input_size: dict[str, int], expand_crop, affine):
    x, y, width, height = bbox
    crop, expanded, _ = expand_crop(rgb, np.array([0, 1, x, y, x + width, y + height]))
    crop_height, crop_width = crop.shape[:2]
    warped, _ = affine(crop, {"im_shape": np.array([crop_height, crop_width], dtype=np.float32)})
    normalized = (warped.astype(np.float32) / np.float32(255) - np.array([.485, .456, .406], np.float32)) / np.array(
        [.229, .224, .225], np.float32
    )
    tensor = np.ascontiguousarray(normalized.transpose(2, 0, 1)[None])
    center = np.round(np.array([[crop_width, crop_height]], np.float32) / 2)
    scale = np.array([[crop_width, crop_height]], np.float32) / 200
    return tensor, center, scale, expanded, crop


def _paddle_heatmap(predictor, tensor: np.ndarray, heatmap_shape: tuple[int, ...]) -> np.ndarray:
    handle = predictor.get_input_handle(predictor.get_input_names()[0])
    handle.reshape(tensor.shape)
    handle.copy_from_cpu(tensor)
    predictor.run()
    outputs = [predictor.get_output_handle(name).copy_to_cpu() for name in predictor.get_output_names()]
    return next(value for value in outputs if value.shape == heatmap_shape)


def _points(postprocess, heatmap: np.ndarray, center: np.ndarray, scale: np.ndarray, expanded: list[int]) -> np.ndarray:
    points = postprocess(heatmap.copy(), center, scale)[0][0]
    points[:, 0] += expanded[0]
    points[:, 1] += expanded[1]
    return points


def _save_fixture_image(path: Path, rgba: np.ndarray) -> dict[str, Any]:
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        rgba.tofile(path)
    return identity(path)


def _build_lock(
    dataset: Path,
    keypoints_archive: Path,
    keypoints_path: Path,
    selection: dict[str, Any],
    people: list[dict[str, Any]],
    images: dict[int, dict[str, Any]],
) -> dict[str, Any]:
    image_ids = selection["imageIds"]
    return {
        "status": "locked-before-inference",
        "selection": {"path": str(dataset / "selection.json"), **identity(dataset / "selection.json")},
        "keypointsArchive": {"path": str(keypoints_archive), "url": KEYPOINT_ARCHIVE["url"], **identity(keypoints_archive)},
        "keypointsAnnotations": {"path": str(keypoints_path), **identity(keypoints_path)},
        "requestedImageIds": image_ids,
        "requestedImages": len(image_ids),
        "people": [{"imageId": item["image_id"], "annotationId": item["id"]} for item in people],
        "peopleCount": len(people),
        "imagesWithPeople": len({item["image_id"] for item in people}),
        "images": [
            {
                "imageId": image_id,
                "file": images[image_id]["file_name"],
                **identity(dataset / "images" / images[image_id]["file_name"]),
            }
            for image_id in image_ids
        ],
    }


def evaluate(args: argparse.Namespace) -> None:
    import cv2
    import onnx
    import onnxruntime as ort
    import paddle

    sys.path.insert(0, str(args.upstream.resolve() / "deploy/python"))
    from keypoint_postprocess import HRNetPostProcess
    from keypoint_preprocess import TopDownEvalAffine, expand_crop

    work = args.work.resolve()
    dataset = args.dataset.resolve()
    report_dir = args.report_dir.resolve()
    fixtures = work / "fixtures"
    keypoints_path = work / "annotations/person_keypoints_val2017.json"
    keypoints = _load_keypoints(args.keypoints_zip.resolve(), keypoints_path)
    selection = json.loads((dataset / "selection.json").read_text(encoding="utf-8"))
    selected_ids = set(selection["imageIds"])
    people = select_people(keypoints["annotations"], selected_ids)
    images = {item["id"]: item for item in keypoints["images"] if item["id"] in selected_ids}
    lock = _build_lock(dataset, args.keypoints_zip.resolve(), keypoints_path, selection, people, images)
    write_json(report_dir / "evaluation-lock.json", lock)

    candidates = json.loads((work / "candidates.json").read_text(encoding="utf-8"))
    models = {item["id"]: item for item in candidates["models"] if item["status"] == "prepared"}
    specs = {
        (96, 128): ("tinypose-enhance-128x96", "tinypose_128x96"),
        (192, 256): ("tinypose-enhance-256x192", "tinypose_256x192"),
    }
    detections = json.loads((dataset / "instances_val2017.json").read_text(encoding="utf-8"))
    parity_people = sorted(
        [
            item
            for item in detections["annotations"]
            if item["image_id"] in selected_ids
            and item["category_id"] == 1
            and not item["iscrowd"]
            and min(item["bbox"][2:]) >= 32
        ],
        key=lambda item: (item["image_id"], item["id"]),
    )[:32]
    detection_images = {item["id"]: item for item in detections["images"]}
    postprocess = HRNetPostProcess(use_dark=True)
    parity_report: dict[str, Any] = {"thresholds": PARITY_THRESHOLDS, "specs": {}}

    for (width, height), (model_id, export_name) in specs.items():
        candidate = models[model_id]
        model_path = Path(candidate["absolutePath"])
        graph = onnx.load(model_path)
        onnx.checker.check_model(graph)
        session = _model_session(model_path)
        predictor = _paddle_predictor(work / "exported" / export_name)
        affine = TopDownEvalAffine([width, height])
        heatmap_shape = (1, 17, height // 4, width // 4)
        cases = []
        for index, annotation in enumerate(parity_people):
            meta = detection_images[annotation["image_id"]]
            image_path = dataset / "images" / meta["file_name"]
            bgr = cv2.imread(str(image_path))
            if bgr is None:
                raise FileNotFoundError(f"无法读取图片：{image_path}")
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            tensor, center, scale, expanded, _ = _preprocess(rgb, annotation["bbox"], {"width": width, "height": height}, expand_crop, affine)
            paddle_heatmap = _paddle_heatmap(predictor, tensor, heatmap_shape)
            onnx_heatmap = session.run(None, {session.get_inputs()[0].name: tensor})[0]
            if not np.isfinite(paddle_heatmap).all() or not np.isfinite(onnx_heatmap).all():
                raise ValueError(f"{model_id} 转换一致性输出包含非有限数值")
            paddle_points = _points(postprocess, paddle_heatmap, center, scale, expanded)
            onnx_points = _points(postprocess, onnx_heatmap, center, scale, expanded)
            point_error = np.linalg.norm(onnx_points[:, :2] - paddle_points[:, :2], axis=1)
            reliable = paddle_points[:, 2] >= .2
            case_dir = fixtures / f"{width}x{height}" / f"{index:02d}"
            case_dir.mkdir(parents=True, exist_ok=True)
            tensor.tofile(case_dir / "input.f32")
            paddle_heatmap.astype(np.float32).tofile(case_dir / "paddle-heatmap.f32")
            image_fixture = fixtures / "images" / f"{annotation['image_id']}.rgba"
            rgba = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGBA)
            image_identity = _save_fixture_image(image_fixture, rgba)
            metadata = {
                "caseId": index,
                "imageId": annotation["image_id"],
                "annotationId": annotation["id"],
                "bbox": annotation["bbox"],
                "expanded": expanded,
                "originalRgba": {"path": str(image_fixture), "width": rgba.shape[1], "height": rgba.shape[0], **image_identity},
                "input": {"path": str(case_dir / "input.f32"), **identity(case_dir / "input.f32")},
                "paddleHeatmap": {"path": str(case_dir / "paddle-heatmap.f32"), **identity(case_dir / "paddle-heatmap.f32")},
            }
            write_json(case_dir / "case.json", metadata)
            cases.append(
                {
                    **metadata,
                    "maxHeatmapAbs": float(np.abs(onnx_heatmap - paddle_heatmap).max()),
                    "reliablePoints": int(reliable.sum()),
                    "maxReliablePointErrorPx": float(point_error[reliable].max()) if reliable.any() else 0.0,
                }
            )
        summary = {
            "cases": len(cases),
            "allFinite": True,
            "maxHeatmapAbs": max(item["maxHeatmapAbs"] for item in cases),
            "maxReliablePointErrorPx": max(item["maxReliablePointErrorPx"] for item in cases),
        }
        summary["passed"] = (
            summary["maxHeatmapAbs"] <= PARITY_THRESHOLDS["maxHeatmapAbs"]
            and summary["maxReliablePointErrorPx"] <= PARITY_THRESHOLDS["maxReliablePointErrorPx"]
        )
        parity_report["specs"][model_id] = {"summary": summary, "cases": cases}
    write_json(report_dir / "conversion-consistency.json", parity_report)

    sessions = {model_id: _model_session(Path(candidate["absolutePath"])) for model_id, candidate in models.items()}
    quality_cases: dict[str, list[dict[str, Any]]] = {model_id: [] for model_id in models}
    point_outputs: dict[str, dict[int, np.ndarray]] = {model_id: {} for model_id in models}
    heatmap_outputs: dict[str, dict[int, np.ndarray]] = {model_id: {} for model_id in models}
    image_cache: dict[int, np.ndarray] = {}
    for case_index, annotation in enumerate(people):
        image_id = annotation["image_id"]
        if image_id not in image_cache:
            image_path = dataset / "images" / images[image_id]["file_name"]
            image_cache[image_id] = cv2.cvtColor(cv2.imread(str(image_path)), cv2.COLOR_BGR2RGB)
        rgb = image_cache[image_id]
        ground_truth = np.asarray(annotation["keypoints"], dtype=np.float64).reshape(17, 3)
        for model_id, candidate in models.items():
            width = candidate["inputSize"]["width"]
            height = candidate["inputSize"]["height"]
            affine = TopDownEvalAffine([width, height])
            tensor, center, scale, expanded, _ = _preprocess(rgb, annotation["bbox"], candidate["inputSize"], expand_crop, affine)
            session = sessions[model_id]
            heatmap = session.run(None, {session.get_inputs()[0].name: tensor})[0]
            if not np.isfinite(heatmap).all():
                raise ValueError(f"{model_id} 的质量评测输出包含非有限数值")
            points = _points(postprocess, heatmap, center, scale, expanded)
            oks = compute_oks(points[:, :2], ground_truth, float(annotation["area"]))
            quality_cases[model_id].append({"case": case_index, "imageId": image_id, "annotationId": annotation["id"], "oks": oks})
            point_outputs[model_id][case_index] = points
            heatmap_outputs[model_id][case_index] = heatmap

    quality_report = {
        "method": "固定 64 图中的全部有效人体，使用 GT 框、上游扩框、DARK、COCO sigma 与 segmentation area；结果不是全量 AP",
        "models": {
            model_id: {"summary": _summarize_oks([item["oks"] for item in cases]), "cases": cases}
            for model_id, cases in quality_cases.items()
        },
    }
    write_json(report_dir / "quality.json", quality_report)

    comparisons = {}
    for fp16_id, fp32_id in [
        ("tinypose-enhance-128x96-fp16", "tinypose-enhance-128x96"),
        ("tinypose-enhance-256x192-fp16", "tinypose-enhance-256x192"),
        ("tinypose-enhance-128x96-w16a32", "tinypose-enhance-128x96"),
        ("tinypose-enhance-256x192-w16a32", "tinypose-enhance-256x192"),
    ]:
        if fp16_id not in models:
            comparisons[fp16_id] = {"status": "conversion-failed", "passed": False}
            continue
        fp32_oks = np.array([item["oks"] for item in quality_cases[fp32_id]])
        fp16_oks = np.array([item["oks"] for item in quality_cases[fp16_id]])
        drops = fp32_oks - fp16_oks
        reliable_errors = []
        for case_index in range(len(people)):
            fp32_points = point_outputs[fp32_id][case_index]
            fp16_points = point_outputs[fp16_id][case_index]
            reliable = fp32_points[:, 2] >= .2
            reliable_errors.extend(np.linalg.norm(fp16_points[reliable, :2] - fp32_points[reliable, :2], axis=1).tolist())
        errors = np.asarray(reliable_errors, dtype=np.float64)
        finite = all(np.isfinite(value).all() for value in heatmap_outputs[fp16_id].values()) and all(
            np.isfinite(value).all() for value in point_outputs[fp16_id].values()
        )
        summary = {
            "status": "evaluated",
            "people": len(people),
            "meanOksDrop": float(fp32_oks.mean() - fp16_oks.mean()),
            "maxPersonOksDrop": float(max(0.0, drops.max())),
            "reliablePoints": int(errors.size),
            "reliablePointErrorP95Px": float(np.percentile(errors, 95)) if errors.size else 0.0,
            "maxReliablePointErrorPx": float(errors.max()) if errors.size else 0.0,
            "allFinite": finite,
            "sizeReductionRatio": 1.0 - models[fp16_id]["bytes"] / models[fp32_id]["bytes"],
        }
        summary["passed"] = (
            finite
            and summary["meanOksDrop"] <= FP16_THRESHOLDS["maxMeanOksDrop"]
            and summary["maxPersonOksDrop"] <= FP16_THRESHOLDS["maxPersonOksDrop"]
            and summary["reliablePointErrorP95Px"] <= FP16_THRESHOLDS["reliablePointErrorP95Px"]
            and summary["maxReliablePointErrorPx"] <= FP16_THRESHOLDS["maxReliablePointErrorPx"]
            and summary["sizeReductionRatio"] >= .3
        )
        comparisons[fp16_id] = summary
    thresholds = {**FP16_THRESHOLDS, "minSizeReductionRatio": .3}
    fp16_comparisons = {key: value for key, value in comparisons.items() if key.endswith("-fp16")}
    write_json(report_dir / "fp16-comparison.json", {"thresholds": thresholds, "comparisons": fp16_comparisons})
    write_json(report_dir / "reduced-precision-comparison.json", {"thresholds": thresholds, "comparisons": comparisons})

    summary = {
        "status": "evaluated",
        "scope": "固定 64 图子集；不是 COCO 全量 AP、手机或 NPU 验证",
        "environment": {
            "python": sys.version,
            "os": platform.platform(),
            "paddle": paddle.__version__,
            "onnx": onnx.__version__,
            "onnxruntime": ort.__version__,
            "numpy": np.__version__,
            "opencv": cv2.__version__,
        },
        "conversionConsistency": {model_id: item["summary"] for model_id, item in parity_report["specs"].items()},
        "quality": {model_id: item["summary"] for model_id, item in quality_report["models"].items()},
        "fp16": fp16_comparisons,
        "reducedPrecision": comparisons,
    }
    write_json(report_dir / "summary.json", summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2, allow_nan=False))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work", required=True, type=Path)
    parser.add_argument("--upstream", required=True, type=Path)
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--keypoints-zip", required=True, type=Path)
    parser.add_argument("--report-dir", required=True, type=Path)
    return parser.parse_args()


if __name__ == "__main__":
    evaluate(parse_args())
