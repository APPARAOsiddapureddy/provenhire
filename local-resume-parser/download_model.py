import os
import sys
import requests

MODEL_URLS = {
    "qwen": "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf",
}


def download(url: str, target_path: str) -> None:
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    with requests.get(url, stream=True, timeout=60) as response:
        response.raise_for_status()
        total = int(response.headers.get("content-length", 0))
        downloaded = 0
        with open(target_path, "wb") as file:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if not chunk:
                    continue
                file.write(chunk)
                downloaded += len(chunk)
                if total:
                    percent = downloaded * 100 // total
                    print(f"\rDownloading... {percent}%", end="", flush=True)
    print("\nDownload complete:", target_path)


if __name__ == "__main__":
    model = (sys.argv[1] if len(sys.argv) > 1 else "qwen").lower()
    if model not in MODEL_URLS:
        print("Unknown model. Use: qwen")
        sys.exit(1)

    dest = os.path.join(
        os.path.dirname(__file__),
        "models",
        "qwen2.5-1.5b-instruct-q4_k_m.gguf",
    )
    download(MODEL_URLS[model], dest)
