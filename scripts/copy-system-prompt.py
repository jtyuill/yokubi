#!/usr/bin/env python3
"""mdBook preprocessor: publish system-prompt.md into the book output tree.

mdBook only copies non-Markdown static files from src/, so we stage the editable
root-level system-prompt.md as src/system-prompt.txt before the HTML renderer runs.
"""

import json
import sys
from pathlib import Path


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "supports":
        sys.exit(0)

    ctx, book = json.load(sys.stdin)
    root = Path(ctx.get("root") or ".").resolve()
    src_prompt = root / "system-prompt.md"
    dest_prompt = root / "src" / "system-prompt.txt"

    if src_prompt.is_file():
        dest_prompt.write_text(src_prompt.read_text(encoding="utf-8"), encoding="utf-8")
    elif not dest_prompt.is_file():
        print(
            "copy-system-prompt: missing system-prompt.md at repo root",
            file=sys.stderr,
        )

    json.dump(book, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
