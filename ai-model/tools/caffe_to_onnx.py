"""
One-time conversion of the Levi-Hassner gender CaffeNet to ONNX.

Run this only if the ONNX file needs regenerating; the runtime does not
import it. Weights are read through OpenCV's Caffe importer, which avoids
needing caffe.proto -- and which is itself the reason this conversion exists:
the importer was REMOVED in OpenCV 5, so the Caffe model pins the project to
opencv<5 forever.

Requires (conversion only, never shipped):
    uv pip install "opencv-python-headless==4.13.0.90" numpy onnx onnxruntime

Two Caffe/ONNX mismatches are handled explicitly:
  * Caffe pooling rounds UP, ONNX rounds down by default -> ceil_mode=1.
    Getting this wrong silently changes fc6's input from 18816 to 13824.
  * Caffe LRN scales alpha by local_size internally, as ONNX does, so alpha
    passes through unchanged with bias=1.0.
"""
import sys
import numpy as np
import cv2
import onnx
from onnx import helper, numpy_helper, TensorProto

MODEL_DIR = sys.argv[1] if len(sys.argv) > 1 else "."
OUT = sys.argv[2] if len(sys.argv) > 2 else "gender_net.onnx"

net = cv2.dnn.readNet(f"{MODEL_DIR}/gender_net.caffemodel", f"{MODEL_DIR}/gender_deploy.prototxt")

inits, nodes = [], []

def add_init(name, arr):
    inits.append(numpy_helper.from_array(arr.astype(np.float32), name))

def conv(name, inp, out, pad, stride):
    w = net.getParam(name, 0)
    b = net.getParam(name, 1).flatten()
    add_init(f"{name}_W", w)
    add_init(f"{name}_b", b)
    k = w.shape[2]
    nodes.append(helper.make_node(
        "Conv", [inp, f"{name}_W", f"{name}_b"], [out], name=name,
        kernel_shape=[k, k], strides=[stride, stride], pads=[pad, pad, pad, pad]))

def gemm(name, inp, out):
    w = net.getParam(name, 0)
    b = net.getParam(name, 1).flatten()
    add_init(f"{name}_W", w)
    add_init(f"{name}_b", b)
    # transB=1: Caffe stores InnerProduct weights as (out_features, in_features).
    nodes.append(helper.make_node(
        "Gemm", [inp, f"{name}_W", f"{name}_b"], [out], name=name, transB=1))

def relu(inp, out):
    nodes.append(helper.make_node("Relu", [inp], [out]))

def pool(inp, out):
    # ceil_mode=1 mirrors Caffe. See module docstring.
    nodes.append(helper.make_node(
        "MaxPool", [inp], [out], kernel_shape=[3, 3], strides=[2, 2], ceil_mode=1))

def lrn(inp, out):
    nodes.append(helper.make_node(
        "LRN", [inp], [out], size=5, alpha=1e-4, beta=0.75, bias=1.0))

conv("conv1", "data", "conv1", pad=0, stride=4)
relu("conv1", "conv1r"); pool("conv1r", "pool1"); lrn("pool1", "norm1")
conv("conv2", "norm1", "conv2", pad=2, stride=1)
relu("conv2", "conv2r"); pool("conv2r", "pool2"); lrn("pool2", "norm2")
conv("conv3", "norm2", "conv3", pad=1, stride=1)
relu("conv3", "conv3r"); pool("conv3r", "pool5")
nodes.append(helper.make_node("Flatten", ["pool5"], ["flat"], axis=1))
gemm("fc6", "flat", "fc6"); relu("fc6", "fc6r")      # dropout is identity at inference
gemm("fc7", "fc6r", "fc7"); relu("fc7", "fc7r")
gemm("fc8", "fc7r", "fc8")
nodes.append(helper.make_node("Softmax", ["fc8"], ["prob"], axis=1))

graph = helper.make_graph(
    nodes, "gender_caffenet",
    inputs=[helper.make_tensor_value_info("data", TensorProto.FLOAT, [1, 3, 227, 227])],
    outputs=[helper.make_tensor_value_info("prob", TensorProto.FLOAT, [1, 2])],
    initializer=inits)

model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)])
model.ir_version = 9
onnx.checker.check_model(model)
onnx.save(model, OUT)
print(f"  wrote {OUT}")
