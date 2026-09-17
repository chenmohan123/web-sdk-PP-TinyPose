"""TinyPose 候选图转换的单元测试。"""

import unittest

import numpy as np
from onnx import TensorProto, helper, numpy_helper

from tools.variants.prepare import convert_conv_weights_to_w16a32, normalize_resize_optional_inputs


class NormalizeResizeInputsTest(unittest.TestCase):
    def test_只省略零元素可选输入并保留非空输入(self) -> None:
        constants = [
            helper.make_node("Constant", [], ["empty_roi"], value=numpy_helper.from_array(np.array([], dtype=np.float32))),
            helper.make_node("Constant", [], ["empty_scales"], value=numpy_helper.from_array(np.array([], dtype=np.float32))),
            helper.make_node("Constant", [], ["roi"], value=numpy_helper.from_array(np.array([0, 0, 1, 1], dtype=np.float32))),
            helper.make_node("Constant", [], ["scales"], value=numpy_helper.from_array(np.array([1, 1, 2, 2], dtype=np.float32))),
        ]
        empty = helper.make_node("Resize", ["x", "empty_roi", "empty_scales", "sizes"], ["empty_output"], name="empty")
        nonempty = helper.make_node("Resize", ["x", "roi", "scales", ""], ["nonempty_output"], name="nonempty")
        graph = helper.make_graph(
            [*constants, empty, nonempty],
            "resize-inputs",
            [helper.make_tensor_value_info("x", TensorProto.FLOAT, [1, 1, 2, 2])],
            [helper.make_tensor_value_info("nonempty_output", TensorProto.FLOAT, None)],
        )
        model = helper.make_model(graph)

        changed = normalize_resize_optional_inputs(model)

        resize_nodes = [node for node in model.graph.node if node.op_type == "Resize"]
        self.assertEqual(changed, 2)
        self.assertEqual(list(resize_nodes[0].input), ["x", "", "", "sizes"])
        self.assertEqual(list(resize_nodes[1].input), ["x", "roi", "scales", ""])


class ConvertWeightsTest(unittest.TestCase):
    def test_只压缩_conv权重并通过cast恢复_float32(self) -> None:
        weight = helper.make_node(
            "Constant",
            [],
            ["weight"],
            value=numpy_helper.from_array(np.ones((1, 1, 1, 1), dtype=np.float32)),
            name="weight",
        )
        convolution = helper.make_node("Conv", ["x", "weight"], ["conv"], name="conv")
        shared = helper.make_node("Add", ["x", "weight"], ["shared"], name="shared")
        graph = helper.make_graph(
            [weight, convolution, shared],
            "w16a32",
            [helper.make_tensor_value_info("x", TensorProto.FLOAT, [1, 1, 1, 1])],
            [helper.make_tensor_value_info("conv", TensorProto.FLOAT, [1, 1, 1, 1])],
        )
        model = helper.make_model(graph)

        result = convert_conv_weights_to_w16a32(model)

        constants = [node for node in model.graph.node if node.op_type == "Constant"]
        casts = [node for node in model.graph.node if node.op_type == "Cast"]
        conv = next(node for node in model.graph.node if node.op_type == "Conv")
        add = next(node for node in model.graph.node if node.op_type == "Add")
        fp16_constant = next(node for node in constants if node.output[0] != "weight")
        tensor = next(attribute.t for attribute in fp16_constant.attribute if attribute.name == "value")
        self.assertEqual(result["constantWeights"], 1)
        self.assertEqual(tensor.data_type, TensorProto.FLOAT16)
        self.assertEqual(list(conv.input), ["x", casts[0].output[0]])
        self.assertEqual(list(add.input), ["x", "weight"])


if __name__ == "__main__":
    unittest.main()
