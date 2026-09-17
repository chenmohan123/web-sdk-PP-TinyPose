"""读取正式 npm 版本，核对 CI 包、SDK 资产和 provenance 内容。"""

import argparse
import base64
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import tarfile

import requests


def get(url):
    response = requests.get(url, timeout=(30, 180))
    response.raise_for_status()
    return response


def identity(data):
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--root", type=Path, required=True)
parser.add_argument("--ci-package", type=Path, required=True)
parser.add_argument("--commit", required=True)
parser.add_argument("--run", required=True)
parser.add_argument("--version", default="0.2.0")
parser.add_argument("--out", type=Path, required=True)
args = parser.parse_args()
name = "web-sdk-pp-tinypose"
repo = "https://github.com/chenmohan123/web-sdk-PP-TinyPose"
url = f"https://registry.npmjs.org/{name}/{args.version}"
metadata = get(url).json()
assert metadata["name"] == name and metadata["version"] == args.version
data = get(metadata["dist"]["tarball"]).content
assert metadata["dist"]["integrity"] == "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode()
assert metadata["dist"]["shasum"] == hashlib.sha1(data).hexdigest()
assert data == args.ci_package.read_bytes(), "npm 包必须逐字节等于 CI 发布产物"

acceptance = json.loads((args.root / "reports/release-acceptance.json").read_text(encoding="utf-8"))
expected_assets = {item["file"]: item for item in acceptance["assets"] if item["file"].startswith("dist/")}
assert expected_assets
with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
    entries = {entry.name.removeprefix("package/"): entry for entry in archive.getmembers() if entry.isfile()}
    assert not any(name.lower().endswith(".onnx") for name in entries)
    package = json.loads(archive.extractfile(entries["package.json"]).read())
    assert package["name"] == name and package["version"] == args.version
    assert {key for key in entries if key.startswith("dist/")} == set(expected_assets)
    for path, expected in expected_assets.items():
        assert identity(archive.extractfile(entries[path]).read()) == {key: expected[key] for key in ("bytes", "sha256")}, path

attestation_meta = metadata["dist"].get("attestations")
assert attestation_meta and attestation_meta.get("url"), "正式版本必须含 provenance"
attestations = get(attestation_meta["url"]).json()
provenance = []
for item in attestations["attestations"]:
    if item["predicateType"] != "https://slsa.dev/provenance/v1":
        continue
    statement = json.loads(base64.b64decode(item["bundle"]["dsseEnvelope"]["payload"]))
    predicate = statement["predicate"]
    definition = predicate["buildDefinition"]
    workflow = definition["externalParameters"]["workflow"]
    assert workflow["repository"] == repo
    assert workflow["path"] == ".github/workflows/release.yml"
    assert workflow["ref"] == f"refs/tags/v{args.version}"
    assert any(dependency.get("digest", {}).get("gitCommit") == args.commit for dependency in definition["resolvedDependencies"])
    assert any(subject.get("digest", {}).get("sha512") == hashlib.sha512(data).hexdigest() for subject in statement["subject"])
    provenance.append(statement)
assert len(provenance) == 1, "预期一项 SLSA provenance"

report = {
    "status": "passed", "verifiedAt": datetime.now(timezone.utc).isoformat(),
    "registryUrl": url, "name": name, "version": args.version,
    "dist": metadata["dist"], "tarball": identity(data),
    "ciRun": args.run, "releaseCommit": args.commit,
    "ciArtifactIdentical": True, "sdkAssetsMatchAcceptance": True,
    "fileCount": len(entries), "containsOnnx": False,
    "provenance": provenance,
    "verificationBoundary": "完整回读 npm/CI 包并核对字节、清单及 provenance 内容；没有自行验证 Sigstore 签名链。",
}
args.out.parent.mkdir(parents=True, exist_ok=True)
args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
print(f"npm {args.version} 包与 CI 一致，{len(expected_assets)} 项 SDK 资产和 provenance 内容通过。")
