"""Turn the picture descriptions in mutt/lexicon.py (MEDIUMS, SIGHTS) into
numbers the server can compare pictures with, saved to mutt/sights.json.

Only needed after changing those descriptions. It isn't part of the app and
needs things the app doesn't: Python packages onnxruntime, numpy and
tokenizers, plus CLIP's text model and tokenizer from
https://huggingface.co/Xenova/clip-vit-base-patch32 (onnx/text_model.onnx,
tokenizer.json) in a folder you name:

    python3 -m venv /tmp/v && /tmp/v/bin/pip install onnxruntime numpy tokenizers
    /tmp/v/bin/python tools/make_sights.py /path/to/model/folder
"""
import base64
import json
import os
import sys

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from mutt import lexicon  # noqa: E402
from mutt.sight import MODEL  # noqa: E402

folder = sys.argv[1]
session = ort.InferenceSession(os.path.join(folder, 'text_model.onnx'), providers=['CPUExecutionProvider'])
tokenizer = Tokenizer.from_file(os.path.join(folder, 'tokenizer.json'))
outputs = [o.name for o in session.get_outputs()]


def embed(text):
    ids = np.array([tokenizer.encode(text.lower()).ids[:77]], np.int64)
    v = session.run(None, {'input_ids': ids})[outputs.index('text_embeds')][0]
    return v / np.linalg.norm(v)


def pack(v):
    v = v / np.linalg.norm(v)
    q = np.clip(np.round(v / np.abs(v).max() * 127), -127, 127).astype(np.int8)
    return base64.b64encode(q.tobytes()).decode()


out = {'model': MODEL, 'mediums': {}, 'sights': {}}
for group, table in (('mediums', lexicon.MEDIUMS), ('sights', lexicon.SIGHTS)):
    for name, (_, _, descriptions) in table.items():
        vs = [embed(d.strip()) for d in descriptions.split(';') if d.strip()]
        out[group][name] = pack(np.mean(vs, axis=0))
        print(group, name, len(vs))
path = os.path.join(os.path.dirname(__file__), '..', 'mutt', 'sights.json')
with open(path, 'w') as f:
    json.dump(out, f, separators=(',', ':'))
print('wrote', path)
