"""TinyPose 候选评测度量与证据锁的单元测试。"""

import json
import tempfile
import unittest
from pathlib import Path

import numpy as np

from tools.variants.evidence import (
    file_identity,
    load_verified_candidates,
    validate_frozen_sample,
    validate_or_create_lock,
    verify_upstream,
)
from tools.variants.evaluate import COCO_KEYPOINT_SIGMAS, compute_oks, select_people


class ComputeOksTest(unittest.TestCase):
    def test_完美匹配返回一(self) -> None:
        ground_truth = np.zeros((17, 3), dtype=np.float64)
        ground_truth[0] = [10.0, 20.0, 2.0]
        ground_truth[1] = [30.0, 40.0, 1.0]
        prediction = ground_truth[:, :2].copy()

        self.assertEqual(compute_oks(prediction, ground_truth, area=1000.0), 1.0)

    def test_已知位移遵循_coco_sigma_和分割面积(self) -> None:
        ground_truth = np.zeros((17, 3), dtype=np.float64)
        ground_truth[0] = [10.0, 20.0, 2.0]
        prediction = ground_truth[:, :2].copy()
        prediction[0, 0] += 2.0
        variance = (COCO_KEYPOINT_SIGMAS[0] * 2.0) ** 2
        expected = np.exp(-(2.0**2) / variance / 1000.0 / 2.0)

        self.assertAlmostEqual(compute_oks(prediction, ground_truth, area=1000.0), expected)

    def test_无可见标注时拒绝计算(self) -> None:
        ground_truth = np.zeros((17, 3), dtype=np.float64)
        prediction = np.zeros((17, 2), dtype=np.float64)

        with self.assertRaisesRegex(ValueError, "可见关键点"):
            compute_oks(prediction, ground_truth, area=1000.0)


class SelectPeopleTest(unittest.TestCase):
    def test_筛选全部有效人体并按图像和标注编号排序(self) -> None:
        annotations = [
            {"id": 9, "image_id": 2, "category_id": 1, "iscrowd": 0, "bbox": [0, 0, 40, 40], "num_keypoints": 1},
            {"id": 8, "image_id": 1, "category_id": 1, "iscrowd": 0, "bbox": [0, 0, 40, 40], "num_keypoints": 1},
            {"id": 7, "image_id": 1, "category_id": 1, "iscrowd": 1, "bbox": [0, 0, 40, 40], "num_keypoints": 1},
            {"id": 6, "image_id": 1, "category_id": 1, "iscrowd": 0, "bbox": [0, 0, 31, 40], "num_keypoints": 1},
            {"id": 5, "image_id": 1, "category_id": 1, "iscrowd": 0, "bbox": [0, 0, 40, 40], "num_keypoints": 0},
            {"id": 4, "image_id": 3, "category_id": 1, "iscrowd": 0, "bbox": [0, 0, 40, 40], "num_keypoints": 1},
        ]

        selected = select_people(annotations, {1, 2})

        self.assertEqual([(item["image_id"], item["id"]) for item in selected], [(1, 8), (2, 9)])


class CandidateEvidenceTest(unittest.TestCase):
    def test_模型改写后拒绝且校验字节直接供推理使用(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            model_path = root / "model.onnx"
            model_path.write_bytes(b"verified-model")
            manifest_path = root / "candidates.json"
            manifest_path.write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "models": [
                            {
                                "id": "candidate",
                                "status": "prepared",
                                "absolutePath": str(model_path),
                                **file_identity(model_path),
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            _, verified_bytes, evidence = load_verified_candidates(manifest_path)
            self.assertEqual(verified_bytes["candidate"], b"verified-model")
            self.assertEqual(evidence["models"]["candidate"]["sha256"], file_identity(model_path)["sha256"])

            model_path.write_bytes(b"tampered-model")
            with self.assertRaisesRegex(ValueError, "candidate.*不符"):
                load_verified_candidates(manifest_path)


class FrozenSampleTest(unittest.TestCase):
    @staticmethod
    def _people(count: int) -> list[dict[str, int]]:
        return [{"image_id": index // 2, "id": index} for index in range(count)]

    def test_拒绝重复或错误计数的图像与人体(self) -> None:
        valid_images = list(range(64))
        valid_people = self._people(110)
        invalid_cases = [
            (valid_images[:-1], valid_people, "64"),
            ([*valid_images, 64], valid_people, "64"),
            ([*valid_images[:-1], valid_images[-2]], valid_people, "唯一"),
            (valid_images, valid_people[:-1], "110"),
            (valid_images, [*valid_people, {"image_id": 63, "id": 110}], "110"),
            (valid_images, [*valid_people[:-1], valid_people[-2]], "唯一"),
        ]
        for image_ids, people, message in invalid_cases:
            with self.subTest(images=len(image_ids), people=len(people), message=message):
                with self.assertRaisesRegex(ValueError, message):
                    validate_frozen_sample(image_ids, people)

    def test_既有锁不匹配时拒绝且不重写(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            lock_path = Path(temporary) / "evaluation-lock.json"
            original = {"images": [{"imageId": 1, "sha256": "original"}]}
            validate_or_create_lock(lock_path, original)
            before = lock_path.read_bytes()

            changed = {"images": [{"imageId": 1, "sha256": "changed"}]}
            with self.assertRaisesRegex(ValueError, "冻结评测锁"):
                validate_or_create_lock(lock_path, changed)
            self.assertEqual(lock_path.read_bytes(), before)


class UpstreamEvidenceTest(unittest.TestCase):
    def test_固定上游文件改变时拒绝(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source.py"
            source.write_bytes(b"fixed")
            expected = {"source.py": file_identity(source)}
            evidence = verify_upstream(root, expected)
            self.assertEqual(evidence["files"][0]["sha256"], expected["source.py"]["sha256"])

            source.write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "固定上游文件.*不符"):
                verify_upstream(root, expected)


if __name__ == "__main__":
    unittest.main()
