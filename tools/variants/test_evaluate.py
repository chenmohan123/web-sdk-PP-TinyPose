"""TinyPose 候选评测度量的单元测试。"""

import unittest

import numpy as np

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


if __name__ == "__main__":
    unittest.main()
