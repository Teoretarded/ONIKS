"""Copy the reference films and menus from the old Oinks workspace into reference/.

    python tools/sync_reference.py

Source: Oinks/renders/ui_overhaul/{menus, extended_menu_cutscenes}
Target: reference/menus, reference/films
Review stills (shots/) and the abandoned kit/ are left behind; gallery thumbnails come along.
Safe to re-run: it overwrites copies, never deletes anything in reference/.
"""
import os
import shutil

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OLD = r'C:/Users/Teo/Documents/projects/Oinks/renders/ui_overhaul'
MAP = {'menus': 'menus', 'extended_menu_cutscenes': 'films'}
SKIP_DIRS = {'shots', 'kit', '__pycache__', '_plates', '_thumbs'}
SKIP_FILES = {'_models.html'}
TEXT = ('.html', '.js', '.py', '.txt', '.css', '.json')


def rewrite(text):
    return (text.replace('localhost:8766/extended_menu_cutscenes', 'localhost:8770/films')
                .replace('localhost:8765/menus', 'localhost:8770/menus')
                .replace('extended_menu_cutscenes/', 'films/'))


def sync():
    n = 0
    for src_name, dst_name in MAP.items():
        src_root = os.path.join(OLD, src_name)
        dst_root = os.path.join(HERE, 'reference', dst_name)
        for dirpath, dirnames, filenames in os.walk(src_root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            rel = os.path.relpath(dirpath, src_root)
            out_dir = os.path.normpath(os.path.join(dst_root, rel))
            os.makedirs(out_dir, exist_ok=True)
            for f in filenames:
                if f in SKIP_FILES:
                    continue
                src, dst = os.path.join(dirpath, f), os.path.join(out_dir, f)
                if f.endswith(TEXT):
                    with open(src, encoding='utf-8', errors='surrogateescape') as fh:
                        data = rewrite(fh.read())
                    with open(dst, 'w', encoding='utf-8', errors='surrogateescape', newline='') as fh:
                        fh.write(data)
                else:
                    shutil.copy2(src, dst)
                n += 1
        os.makedirs(os.path.join(dst_root, 'shots'), exist_ok=True)
    print(f'synced {n} files')


if __name__ == '__main__':
    sync()
