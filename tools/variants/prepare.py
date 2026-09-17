"""固定官方源并准备 TinyPose 128×96/256×192 FP32 与 FP16 ONNX 候选。"""

from __future__ import annotations

import argparse
import json
import platform
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from collections import Counter
from copy import deepcopy
from pathlib import Path
from typing import Any

import numpy as np
import onnx
import onnxruntime as ort
from onnx import helper, numpy_helper
from onnxconverter_common.float16 import convert_float_to_float16 as common_convert_float_to_float16
from onnxruntime.transformers.float16 import DEFAULT_OP_BLOCK_LIST, convert_float_to_float16 as ort_convert_float_to_float16
from onnxruntime.transformers.onnx_model import OnnxModel

try:
    from .evidence import UPSTREAM_REVISION, file_identity, verify_identity, verify_upstream, write_json
except ImportError:
    from evidence import UPSTREAM_REVISION, file_identity, verify_identity, verify_upstream, write_json

SOURCE_128 = {
    "url": "https://bj.bcebos.com/v1/paddledet/models/keypoint/tinypose_enhance/tinypose_128x96.zip",
    "bytes": 5397578,
    "sha256": "b737aa851a1ce9403950280be5df4bdd9c0e0287dd7ecdaa16f534d9c940015d",
    "assets": {
        "infer_cfg.yml": {"bytes": 343, "sha256": "b3f7e023bfd403144455d75bfd6028cec6c5283d4ad8398cf24135948f8b7720"},
        "model.pdiparams.info": {"bytes": 135248, "sha256": "62b1cb256f4c53100e893ed4c07023506ac4e834c86bcf8a343f35a4280f3480"},
        "model.pdiparams": {"bytes": 5456137, "sha256": "8ae7262a63a27d7011bd9ac7993bd261ba1c5dbdfae1b2753dca9711b0b4b665"},
        "model.pdmodel": {"bytes": 10928441, "sha256": "4a416c423b2ddb8ca0e76b8edd965051cf35981a3ac331f6a1952217e97056bb"},
    },
}


def verify(path: Path, expected: dict[str, Any], label: str) -> None:
    actual = file_identity(path)
    verify_identity(actual, expected, label)


def download_locked(url: str, output: Path, expected: dict[str, Any]) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    if not output.exists():
        with urllib.request.urlopen(url, timeout=120) as response:
            data = response.read(expected["bytes"] + 1)
        output.write_bytes(data)
    verify(output, expected, url)


def extract_locked(archive_path: Path, output: Path) -> list[dict[str, Any]]:
    output.mkdir(parents=True, exist_ok=True)
    results = []
    with zipfile.ZipFile(archive_path) as archive:
        for name, expected in SOURCE_128["assets"].items():
            target = output / name
            target.write_bytes(archive.read(f"tinypose_128x96/{name}"))
            verify(target, expected, name)
            results.append({"path": name, **file_identity(target)})
    return results


def convert_fp32(exported: Path, output: Path) -> None:
    converter = Path(sys.executable).with_name("paddle2onnx.exe")
    command = str(converter) if converter.exists() else shutil.which("paddle2onnx")
    if not command:
        raise RuntimeError("固定环境中缺少 paddle2onnx 命令")
    subprocess.run(
        [
            command,
            "--model_dir",
            str(exported),
            "--model_filename",
            "model.pdmodel",
            "--params_filename",
            "model.pdiparams",
            "--opset_version",
            "17",
            "--save_file",
            str(output),
        ],
        check=True,
    )
    onnx.checker.check_model(output)


def normalize_resize_optional_inputs(model: onnx.ModelProto) -> int:
    """将零元素 Constant 表示的 Resize 可选输入规范化为空输入。"""
    producers = {name: node for node in model.graph.node for name in node.output}
    changed = 0
    for node in model.graph.node:
        if node.op_type != "Resize":
            continue
        for index in (1, 2):
            if index >= len(node.input) or not node.input[index]:
                continue
            producer = producers.get(node.input[index])
            if producer is None or producer.op_type != "Constant":
                continue
            is_empty = any(
                attribute.name == "value" and numpy_helper.to_array(attribute.t).size == 0
                for attribute in producer.attribute
            )
            if is_empty:
                node.input[index] = ""
                changed += 1
    return changed


def graph_statistics(model: onnx.ModelProto) -> dict[str, Any]:
    tensor_types = Counter(onnx.TensorProto.DataType.Name(item.data_type) for item in model.graph.initializer)
    constant_types: Counter[str] = Counter()
    constant_elements: Counter[str] = Counter()
    for node in model.graph.node:
        for attribute in node.attribute:
            if attribute.name != "value" or not attribute.HasField("t"):
                continue
            type_name = onnx.TensorProto.DataType.Name(attribute.t.data_type)
            constant_types[type_name] += 1
            constant_elements[type_name] += int(numpy_helper.to_array(attribute.t).size)
    return {
        "operators": dict(sorted(Counter(node.op_type for node in model.graph.node).items())),
        "initializerTypes": dict(sorted(tensor_types.items())),
        "constantTensorTypes": dict(sorted(constant_types.items())),
        "constantTensorElements": dict(sorted(constant_elements.items())),
        "nodes": len(model.graph.node),
        "initializers": len(model.graph.initializer),
    }


def _fp16_tensor(tensor: onnx.TensorProto, name: str) -> onnx.TensorProto:
    return numpy_helper.from_array(numpy_helper.to_array(tensor).astype(np.float16), name=name)


def convert_conv_weights_to_w16a32(model: onnx.ModelProto) -> dict[str, int]:
    """仅压缩 Conv 常量权重，并在算子前 Cast 回 float32。"""
    consumers: dict[str, list[tuple[onnx.NodeProto, int]]] = {}
    producers = {name: node for node in model.graph.node for name in node.output}
    initializers = {item.name: item for item in model.graph.initializer}
    for node in model.graph.node:
        for index, name in enumerate(node.input):
            if name:
                consumers.setdefault(name, []).append((node, index))

    result = {"constantWeights": 0, "initializerWeights": 0, "castNodes": 0, "elements": 0}
    rewritten_nodes: list[onnx.NodeProto] = []
    serial = 0
    for node in model.graph.node:
        additions: list[onnx.NodeProto] = []
        if node.op_type == "Conv":
            for index in range(1, len(node.input)):
                source_name = node.input[index]
                if not source_name:
                    continue
                producer = producers.get(source_name)
                initializer = initializers.get(source_name)
                tensor = None
                attribute = None
                if producer is not None and producer.op_type == "Constant":
                    attribute = next(
                        (item for item in producer.attribute if item.name == "value" and item.HasField("t")), None
                    )
                    tensor = attribute.t if attribute is not None else None
                elif initializer is not None:
                    tensor = initializer
                if tensor is None or tensor.data_type != onnx.TensorProto.FLOAT:
                    continue
                array = numpy_helper.to_array(tensor)
                if array.size == 0:
                    continue

                serial += 1
                exclusive = len(consumers[source_name]) == 1
                storage_name = source_name if exclusive else f"{source_name}_w16a32_{serial}"
                converted_tensor = _fp16_tensor(tensor, storage_name)
                if producer is not None:
                    if exclusive:
                        attribute.t.CopyFrom(converted_tensor)
                    else:
                        clone = deepcopy(producer)
                        clone.name = f"{producer.name or 'Constant'}_w16a32_{serial}"
                        clone.output[0] = storage_name
                        clone_attribute = next(item for item in clone.attribute if item.name == "value")
                        clone_attribute.t.CopyFrom(converted_tensor)
                        additions.append(clone)
                    result["constantWeights"] += 1
                else:
                    if exclusive:
                        initializer.CopyFrom(converted_tensor)
                    else:
                        model.graph.initializer.append(converted_tensor)
                    result["initializerWeights"] += 1

                cast_output = f"{storage_name}_fp32_for_{node.name or 'Conv'}_{index}"
                additions.append(
                    helper.make_node(
                        "Cast",
                        [storage_name],
                        [cast_output],
                        name=f"W16A32_Cast_{serial}",
                        to=onnx.TensorProto.FLOAT,
                    )
                )
                node.input[index] = cast_output
                result["castNodes"] += 1
                result["elements"] += int(array.size)
        rewritten_nodes.extend(additions)
        rewritten_nodes.append(node)
    del model.graph.node[:]
    model.graph.node.extend(rewritten_nodes)
    return result


def _validate_fp16_model(model: onnx.ModelProto, output: Path) -> dict[str, Any]:
    onnx.checker.check_model(model)
    temporary = output.with_suffix(output.suffix + ".tmp")
    temporary.unlink(missing_ok=True)
    onnx.save_model(model, temporary, save_as_external_data=False)
    try:
        options = ort.SessionOptions()
        options.log_severity_level = 3
        session = ort.InferenceSession(str(temporary), sess_options=options, providers=["CPUExecutionProvider"])
        input_meta = session.get_inputs()[0]
        output_meta = session.get_outputs()[0]
        if input_meta.type != "tensor(float)" or output_meta.type != "tensor(float)":
            raise ValueError("FP16 候选没有保留 float32 I/O")
        input_shape = tuple(1 if not isinstance(value, int) or value <= 0 else value for value in input_meta.shape)
        heatmap = session.run(None, {input_meta.name: np.zeros(input_shape, dtype=np.float32)})[0]
        if heatmap.dtype != np.float32 or not np.isfinite(heatmap).all():
            raise ValueError("FP16 候选的 CPU 探针输出类型错误或包含非有限数值")
        has_fp16_initializer = any(item.data_type == onnx.TensorProto.FLOAT16 for item in model.graph.initializer)
        has_fp16_constant = any(
            attribute.name == "value"
            and attribute.HasField("t")
            and attribute.t.data_type == onnx.TensorProto.FLOAT16
            and numpy_helper.to_array(attribute.t).size > 0
            for node in model.graph.node
            for attribute in node.attribute
        )
        if not has_fp16_initializer and not has_fp16_constant:
            raise ValueError("转换图没有非空 float16 权重张量")
        temporary.replace(output)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    return {"probeOutputShape": list(heatmap.shape), "probeOutputType": str(heatmap.dtype)}


def convert_fp16_standard(source: Path, output: Path) -> dict[str, Any]:
    """普通 FP16 图转换：保留 float32 I/O，内部权重与张量转为 float16。"""
    model = onnx.load(source, load_external_data=False)
    converted = common_convert_float_to_float16(model, keep_io_types=True)
    probe = _validate_fp16_model(converted, output)
    return {
        "strategy": "onnxconverter-common convert_float_to_float16(keep_io_types=True)",
        "inputType": "float32",
        "outputType": "float32",
        "graphPrecision": "float16",
        "runtimeComputePrecision": "由后端实现决定，不宣称全 FP16 计算",
        "graphStatistics": graph_statistics(converted),
        **probe,
    }


def convert_fp16_resize_blocked(source: Path, output: Path) -> dict[str, Any]:
    """诊断路径：仅让 onnxconverter-common 将 Resize 留在 FP32。"""
    model = onnx.load(source, load_external_data=False)
    converted = common_convert_float_to_float16(model, keep_io_types=True, op_block_list=["Resize"])
    probe = _validate_fp16_model(converted, output)
    return {
        "strategy": "onnxconverter-common，Resize 保持 FP32",
        "inputType": "float32",
        "outputType": "float32",
        "graphPrecision": "mixed-fp16",
        "blockedOperators": ["Resize"],
        "graphStatistics": graph_statistics(converted),
        **probe,
    }


def convert_fp16_mixed(source: Path, output: Path) -> dict[str, Any]:
    """转换 TinyPose 混合 FP16 图；Resize 保持 FP32，I/O 保持 float32。"""
    model = onnx.load(source, load_external_data=False)
    normalized_inputs = normalize_resize_optional_inputs(model)
    blocked_ops = sorted(set(DEFAULT_OP_BLOCK_LIST) | {"Resize"})
    converted = ort_convert_float_to_float16(model, keep_io_types=True, op_block_list=blocked_ops)
    OnnxModel(converted).topological_sort()
    probe = _validate_fp16_model(converted, output)
    return {
        "strategy": "onnxruntime.transformers.float16，转换前规范化零元素 Resize 可选输入",
        "inputType": "float32",
        "outputType": "float32",
        "graphPrecision": "mixed-fp16，Resize 与工具默认阻塞算子保持 FP32",
        "runtimeComputePrecision": "由后端实现决定，不宣称全 FP16 计算",
        "blockedOperators": blocked_ops,
        "normalizedEmptyResizeInputs": normalized_inputs,
        "graphStatistics": graph_statistics(converted),
        **probe,
    }


def convert_w16a32(source: Path, output: Path) -> dict[str, Any]:
    """只压缩 Conv 权重存储；全部算子、激活和 I/O 仍为 float32。"""
    model = onnx.load(source, load_external_data=False)
    conversion = convert_conv_weights_to_w16a32(model)
    OnnxModel(model).topological_sort()
    probe = _validate_fp16_model(model, output)
    return {
        "strategy": "Conv 常量权重 float16 存储，算子前 Cast 恢复 float32",
        "storagePrecision": "float16",
        "activationPrecision": "float32",
        "operatorPrecision": "float32",
        "inputType": "float32",
        "outputType": "float32",
        "label": "W16A32，不宣称 FP16 计算",
        "conversion": conversion,
        "graphStatistics": graph_statistics(model),
        **probe,
    }


def candidate(model_id: str, precision: str, width: int, height: int, path: Path, **extra: Any) -> dict[str, Any]:
    value = {
        "id": model_id,
        "precision": precision,
        "inputSize": {"width": width, "height": height},
        "path": f".tmp/variants/models/{path.name}",
        "absolutePath": str(path.resolve()),
        "status": "prepared",
        **file_identity(path),
    }
    value.update(extra)
    return value


def prepare(args: argparse.Namespace) -> None:
    import cv2
    import numpy
    import onnxconverter_common
    import paddle
    import paddle2onnx

    upstream_evidence = verify_upstream(args.upstream)
    work = args.work.resolve()
    models_dir = work / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    archive_128 = work / "downloads/tinypose_128x96.zip"
    download_locked(SOURCE_128["url"], archive_128, SOURCE_128)
    exported_128 = work / "exported/tinypose_128x96"
    assets_128 = extract_locked(archive_128, exported_128)

    source_readme = args.upstream.resolve() / "configs/keypoint/tiny_pose/README.md"
    source_config = args.upstream.resolve() / "configs/keypoint/tiny_pose/tinypose_128x96.yml"
    source_text = source_readme.read_text(encoding="utf-8")
    if SOURCE_128["url"] not in source_text:
        raise ValueError("固定上游 README 未声明增强版 128×96 ZIP")

    fp32_128 = models_dir / "tinypose-enhance-128x96-fp32.onnx"
    convert_fp32(exported_128, fp32_128)

    legacy_report = json.loads(args.legacy_report.read_text(encoding="utf-8"))
    verify(args.legacy_model.resolve(), legacy_report["model"], "旧 256×192 FP32 ONNX")
    fp32_256 = models_dir / "tinypose-enhance-256x192-fp32.onnx"
    shutil.copyfile(args.legacy_model.resolve(), fp32_256)
    verify(fp32_256, legacy_report["model"], "复制后的 256×192 FP32 ONNX")
    exported_256 = work / "exported/tinypose_256x192"
    exported_256.mkdir(parents=True, exist_ok=True)
    legacy_archive = work / "downloads/tinypose_256x192.zip"
    legacy_exported = args.legacy_work.resolve() / "exported/tinypose_256x192"
    if not all((legacy_exported / item["path"]).exists() for item in legacy_report["paddleAssets"]):
        download_locked(legacy_report["archiveUrl"], legacy_archive, legacy_report["archive"])
        with zipfile.ZipFile(legacy_archive) as archive:
            for item in legacy_report["paddleAssets"]:
                target = exported_256 / item["path"]
                target.write_bytes(archive.read(f"tinypose_256x192/{item['path']}"))
                verify(target, item, f"旧 256×192 Paddle 资产 {item['path']}")
    else:
        for item in legacy_report["paddleAssets"]:
            source = legacy_exported / item["path"]
            verify(source, item, f"旧 256×192 Paddle 资产 {item['path']}")
            shutil.copyfile(source, exported_256 / item["path"])

    models = [
        candidate("tinypose-enhance-128x96", "fp32", 96, 128, fp32_128),
        candidate("tinypose-enhance-256x192", "fp32", 192, 256, fp32_256, legacyIdentityPreserved=True),
    ]
    conversion_attempts = []
    for fp32_id, source, width, height in [
        ("tinypose-enhance-128x96", fp32_128, 96, 128),
        ("tinypose-enhance-256x192", fp32_256, 192, 256),
    ]:
        fp16_id = fp32_id + "-fp16"
        output = models_dir / f"{fp16_id}.onnx"
        attempt = {"id": fp16_id, "source": fp32_id, "attempts": []}
        try:
            conversion = convert_fp16_standard(source, output)
            attempt["attempts"].append({"method": "普通 FP16 图转换（float32 I/O）", "status": "prepared"})
        except Exception as standard_error:
            attempt["attempts"].append(
                {
                    "method": "普通 FP16 图转换（float32 I/O）",
                    "status": "failed",
                    "error": f"{type(standard_error).__name__}: {standard_error}",
                }
            )
            try:
                conversion = convert_fp16_resize_blocked(source, output)
                attempt["attempts"].append({"method": "onnxconverter-common，Resize 保持 FP32", "status": "prepared"})
            except Exception as resize_error:
                attempt["attempts"].append(
                    {
                        "method": "onnxconverter-common，Resize 保持 FP32",
                        "status": "failed",
                        "error": f"{type(resize_error).__name__}: {resize_error}",
                    }
                )
                try:
                    conversion = convert_fp16_mixed(source, output)
                    attempt["attempts"].append(
                        {
                            "method": "混合 FP16 图：规范化空 Resize 输入，Resize 与默认阻塞算子保持 FP32",
                            "status": "prepared",
                            "normalizedEmptyResizeInputs": conversion["normalizedEmptyResizeInputs"],
                        }
                    )
                except Exception as mixed_error:
                    attempt["attempts"].append(
                        {
                            "method": "混合 FP16 图：规范化空 Resize 输入，Resize 与默认阻塞算子保持 FP32",
                            "status": "failed",
                            "error": f"{type(mixed_error).__name__}: {mixed_error}",
                        }
                    )
                    conversion = None

        if conversion is not None:
            reduction = 1.0 - output.stat().st_size / source.stat().st_size
            attempt.update({"status": "prepared", "sizeReductionRatio": reduction, "conversion": conversion, **file_identity(output)})
            models.append(candidate(fp16_id, "fp16", width, height, output, conversion=conversion, sizeReductionRatio=reduction))
        else:
            error = attempt["attempts"][-1]["error"]
            attempt.update({"status": "failed", "error": error})
            models.append(
                {
                    "id": fp16_id,
                    "precision": "fp16",
                    "inputSize": {"width": width, "height": height},
                    "path": f".tmp/variants/models/{output.name}",
                    "absolutePath": str(output.resolve()),
                    "status": "failed",
                    "bytes": 0,
                    "sha256": None,
                    "error": error,
                }
            )
        conversion_attempts.append(attempt)

    w16a32_conversions = []
    for fp32_id, source, width, height in [
        ("tinypose-enhance-128x96", fp32_128, 96, 128),
        ("tinypose-enhance-256x192", fp32_256, 192, 256),
    ]:
        model_id = fp32_id + "-w16a32"
        output = models_dir / f"{model_id}.onnx"
        record: dict[str, Any] = {"id": model_id, "source": fp32_id}
        try:
            conversion = convert_w16a32(source, output)
            reduction = 1.0 - output.stat().st_size / source.stat().st_size
            record.update({"status": "prepared", "sizeReductionRatio": reduction, "conversion": conversion, **file_identity(output)})
            models.append(candidate(model_id, "w16a32", width, height, output, conversion=conversion, sizeReductionRatio=reduction))
        except Exception as error:
            record.update({"status": "failed", "error": f"{type(error).__name__}: {error}"})
            models.append(
                {
                    "id": model_id,
                    "precision": "w16a32",
                    "inputSize": {"width": width, "height": height},
                    "path": f".tmp/variants/models/{output.name}",
                    "absolutePath": str(output.resolve()),
                    "status": "failed",
                    "bytes": 0,
                    "sha256": None,
                    "error": record["error"],
                }
            )
        w16a32_conversions.append(record)

    candidates = {"schemaVersion": 1, "models": models}
    write_json(work / "candidates.json", candidates)
    report = {
        "status": "prepared" if all(item["status"] == "prepared" for item in models) else "prepared-with-failures",
        "upstreamRevision": UPSTREAM_REVISION,
        "upstream": upstream_evidence,
        "sourceEvidence": [
            {"path": str(source_readme), **file_identity(source_readme)},
            {"path": str(source_config), **file_identity(source_config)},
        ],
        "archive128": {"url": SOURCE_128["url"], "path": str(archive_128), **file_identity(archive_128)},
        "paddleAssets128": assets_128,
        "legacy256": {"source": str(args.legacy_model.resolve()), **file_identity(fp32_256)},
        "conversionAttempts": conversion_attempts,
        "w16a32Conversions": w16a32_conversions,
        "tools": {
            "python": sys.version,
            "os": platform.platform(),
            "paddle": paddle.__version__,
            "paddle2onnx": paddle2onnx.__version__,
            "onnx": onnx.__version__,
            "onnxruntime": ort.__version__,
            "onnxconverterCommon": onnxconverter_common.__version__,
            "numpy": numpy.__version__,
            "opencv": cv2.__version__,
        },
        "candidates": candidates,
    }
    write_json(args.report_dir.resolve() / "preparation.json", report)
    print(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False))


def parse_args() -> argparse.Namespace:
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work", type=Path, default=root / ".tmp/variants")
    parser.add_argument("--upstream", required=True, type=Path)
    parser.add_argument("--legacy-model", required=True, type=Path)
    parser.add_argument("--legacy-work", required=True, type=Path)
    parser.add_argument("--legacy-report", type=Path, default=root / "reports/2026-09-16-feasibility/reference.json")
    parser.add_argument("--report-dir", type=Path, default=root / "reports/2026-09-17-variants")
    return parser.parse_args()


if __name__ == "__main__":
    prepare(parse_args())
