#!/usr/bin/env python3
"""
Downloads and extracts the official COEIROINK Linux CPU / GPU package.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import zipfile
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests

BASE_URL = "https://coeiroink.com"
DOWNLOAD_PAGE_URL = f"{BASE_URL}/download"

# Hardcoded fallback URLs from official distribution if dynamic resolution fails
FALLBACK_URLS = {
    "CPU": "https://www.dropbox.com/scl/fi/o7xnjfo0jw81otgn2jxar/COEIROINK_LINUX_CPU_v.2025.4.1.zip?rlkey=dt1z2bxrbo3ikm2iiioxh9wx7&st=tso7516f&dl=1",
    "GPU": "https://www.dropbox.com/scl/fi/pisvh3pwlinz6hdep2fcr/COEIROINK_LINUX_GPU_v.2025.4.1.zip?rlkey=4dg1368zzdbplahcjdbqoj2tg&st=3k7yonjs&dl=1",
}


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Downloads COEIROINK Linux package.")
    device_group = parser.add_mutually_exclusive_group(required=True)
    device_group.add_argument("--cpu", action="store_true", help="Download CPU package.")
    device_group.add_argument("--gpu", action="store_true", help="Download GPU package.")
    return parser.parse_args()


def fetch_latest_download_url(device: str) -> str:
    session = requests.Session()
    try:
        res = session.get(DOWNLOAD_PAGE_URL, timeout=20)
        res.raise_for_status()

        # Find javascript bundles referenced on download page
        script_paths = re.findall(r'<script[^>]+src="([^"]+)"', res.text)
        for sp in script_paths:
            abs_url = urljoin(BASE_URL, sp)
            js_res = session.get(abs_url, timeout=20)
            if f"COEIROINK_LINUX_{device}" in js_res.text:
                urls = re.findall(
                    rf'https://[^\s"]+dropbox[^\s"]*COEIROINK_LINUX_{device}[^\s"]*',
                    js_res.text,
                    re.IGNORECASE,
                )
                if urls:
                    clean_url = urls[0].split('\\')[0].split('"')[0]
                    if not clean_url.endswith("&dl=1") and not clean_url.endswith("?dl=1"):
                        clean_url += ("&dl=1" if "?" in clean_url else "?dl=1")
                    print(f"Dynamically resolved URL: {clean_url}")
                    return clean_url
    except Exception as e:
        print(f"Dynamic resolution notice: {e}, using verified fallback URL...")

    return FALLBACK_URLS[device]


def download_file(url: str, destination: Path) -> None:
    print(f"Downloading from: {url}")
    with requests.get(url, stream=True, timeout=600) as response:
        response.raise_for_status()
        total_size = int(response.headers.get("content-length", 0))
        downloaded = 0
        with destination.open("wb") as file:
            for chunk in response.iter_content(chunk_size=1024 * 1024 * 2):
                if chunk:
                    file.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0:
                        percent = (downloaded / total_size) * 100
                        print(f"\rProgress: {downloaded // (1024*1024)}MB / {total_size // (1024*1024)}MB ({percent:.1f}%)", end="")
    print("\nDownload complete.")


def extract_archive(archive_path: Path, destination_dir: Path) -> Path:
    extract_dir = destination_dir / "coeiroink"
    extract_dir.mkdir(parents=True, exist_ok=True)
    print(f"Extracting {archive_path} to {extract_dir}...")

    with zipfile.ZipFile(archive_path) as archive:
        for member in archive.infolist():
            member_path = Path(member.filename)
            # Flatten top directory if present
            relative_parts = member_path.parts[1:] if len(member_path.parts) > 1 else member_path.parts
            if not relative_parts:
                continue

            output_path = extract_dir.joinpath(*relative_parts)
            if member.is_dir():
                output_path.mkdir(parents=True, exist_ok=True)
                continue

            output_path.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member) as source, output_path.open("wb") as target:
                target.write(source.read())

    print("Extraction complete.")
    return extract_dir


def main() -> int:
    args = parse_arguments()
    device = "GPU" if args.gpu else "CPU"
    work_dir = Path.cwd()

    url = fetch_latest_download_url(device)
    archive_path = work_dir / f"coeiroink_{device.lower()}.zip"

    try:
        download_file(url, archive_path)
        extract_archive(archive_path, work_dir)
        archive_path.unlink()
        print("COEIROINK setup successfully finished.")
        return 0
    except Exception as err:
        print(f"Error setting up COEIROINK: {err}", file=sys.stderr)
        if archive_path.exists():
            archive_path.unlink()
        return 1


if __name__ == "__main__":
    sys.exit(main())
