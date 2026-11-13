#!/usr/bin/env python3
"""
Cuts freedoom2.wad into the packs public/freedoom/ downloads, and checks them.

    tools/freedoom/make-packs.py build <freedoom2.wad>   write packs + packs.json
    tools/freedoom/make-packs.py verify                  rebuild the WAD from the
                                                         packs and check its hash
    tools/freedoom/make-packs.py unpack <out.wad>        the same, and keep it

Why packs. The whole game is 29 MB, 11 MB gzipped, and none of it used to be
playable until all of it had arrived. But the title screen and menu need only
the sprites, fonts and tables; a level needs its own map and the wall art it
uses; and nobody needs level 20's walls while standing in level 1. So:

    core     everything every level needs: sprites, floors, music, menus,
             the handful of sounds the menu makes, and the WAD's own header
             and directory
    sfx      the rest of the sound effects
    mNN      level NN, plus the wall patches no earlier level needed
    extra    wall patches no level uses at all

The page fetches core, starts the game, then pulls the others in behind it.
Before a level loads, the engine waits for the packs listed for it in
packs.json ("levels"). web/web_wad.c is the other half of this.

Each pack is one LZMA stream (the ".lzma" container: 13 bytes of header, then
data), which the engine unpacks itself. LZMA because it is about a quarter
smaller than gzip on this data.

Nothing here changes the game: `verify` puts the packs back together and
compares the result, byte for byte by SHA-256, with the file they came from.

Python because it has LZMA in its standard library and Node does not.
"""

import collections
import hashlib
import json
import lzma
import os
import re
import struct
import sys
import tarfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
GAME = os.path.join(ROOT, 'public', 'freedoom')
DATA = os.path.join(GAME, 'data')
MANIFEST = os.path.join(GAME, 'packs.json')
ENGINE_SOURCE = os.path.join(GAME, 'source', 'crispy-doom_6.0.orig.tar.gz')

MAP_PARTS = {'THINGS', 'LINEDEFS', 'SIDEDEFS', 'VERTEXES', 'SEGS', 'SSECTORS',
             'NODES', 'SECTORS', 'REJECT', 'BLOCKMAP'}

# What the menu and title screen play, so they are not silent while the
# sound pack is still on its way.
MENU_SOUNDS = {'DSPISTOL', 'DSSWTCHN', 'DSSWTCHX', 'DSPSTOP', 'DSSTNMOV', 'DSOOF'}


def name8(raw):
    return raw.split(b'\0')[0].decode('latin1').upper()


def read_wad(wad):
    """-> list of (name, pos, size), in directory order."""
    if wad[:4] != b'IWAD':
        sys.exit('not an IWAD')
    count, directory = struct.unpack_from('<ii', wad, 4)
    lumps = []
    for i in range(count):
        pos, size = struct.unpack_from('<ii', wad, directory + i * 16)
        lumps.append((name8(wad[directory + i * 16 + 8:directory + i * 16 + 16]), pos, size))
    return lumps, directory


def engine_tables():
    """Texture animations and switch pairs, read out of the engine's source.

    A wall can show textures its map never names: a switch flips to its
    other face, an animated wall cycles through its frames. The lists of
    which are in p_spec.c and p_switch.c. Reading them from the source the
    binary was built from keeps the two in step."""
    anims, switches = [], []
    with tarfile.open(ENGINE_SOURCE) as tar:
        for member in tar.getmembers():
            if member.name.endswith('src/doom/p_spec.c'):
                text = tar.extractfile(member).read().decode('latin1')
                for kind, end, start in re.findall(r'\{\s*(true|false)\s*,\s*"(\w+)"\s*,\s*"(\w+)"\s*,\s*\d+\s*\}', text):
                    if kind == 'true':
                        anims.append((start.upper(), end.upper()))
            elif member.name.endswith('src/doom/p_switch.c'):
                text = tar.extractfile(member).read().decode('latin1')
                for a, b in re.findall(r'\{\s*"(\w+)"\s*,\s*"(\w+)"\s*,\s*\d\s*\}', text):
                    switches.append((a.upper(), b.upper()))
    if not anims or not switches:
        sys.exit('could not read the animation and switch tables from the engine source')
    return anims, switches


def plan(wad):
    """Decide which pack every byte of the WAD goes in."""
    lumps, directory = read_wad(wad)
    index = {}
    for i, (name, _, _) in enumerate(lumps):
        index[name] = i  # a later lump of the same name wins, as in the engine

    def data(name):
        _, pos, size = lumps[index[name]]
        return wad[pos:pos + size]

    # --- textures: name -> the patch lumps it is assembled from
    pnames = data('PNAMES')
    patch_names = [name8(pnames[4 + i * 8:12 + i * 8]) for i in range(struct.unpack_from('<i', pnames)[0])]
    textures = collections.OrderedDict()
    for lump in ('TEXTURE1', 'TEXTURE2'):
        if lump not in index:
            continue
        t = data(lump)
        for k in range(struct.unpack_from('<i', t)[0]):
            off = struct.unpack_from('<i', t, 4 + k * 4)[0]
            n = struct.unpack_from('<h', t, off + 20)[0]
            textures[name8(t[off:off + 8])] = [
                patch_names[struct.unpack_from('<h', t, off + 22 + j * 10 + 4)[0]] for j in range(n)]
    order = list(textures)
    at = {name: i for i, name in enumerate(order)}

    anims, switches = engine_tables()
    family = {}
    for start, end in anims:
        if start in at and end in at:
            frames = order[at[start]:at[end] + 1]
            for name in frames:
                family.setdefault(name, set()).update(frames)
    for a, b in switches:
        if a in at and b in at:
            family.setdefault(a, set()).add(b)
            family.setdefault(b, set()).add(a)

    # --- sort the lumps into kinds
    kind = {}       # lump index -> 'map:NN' | 'patch' | 'sfx' | 'core'
    maps = collections.OrderedDict()
    section = None
    current = None
    for i, (name, pos, size) in enumerate(lumps):
        if re.fullmatch(r'MAP\d\d', name):
            current = int(name[3:])
            maps[current] = {'lumps': [], 'parts': {}}
            kind[i] = 'core'  # the marker itself is empty
            continue
        if current is not None and name in MAP_PARTS:
            maps[current]['lumps'].append(i)
            maps[current]['parts'][name] = wad[pos:pos + size]
            kind[i] = f'map:{current}'
            continue
        current = None
        if re.fullmatch(r'P\d?_START|PP_START', name):
            section = 'patch'
        elif re.fullmatch(r'P_END|PP_END', name):
            section = None
        if section == 'patch' and size > 0:
            kind[i] = 'patch'
        elif name[:2] in ('DS', 'DP') and name not in MENU_SOUNDS and size > 8 and section is None \
                and wad[pos:pos + 2] in (b'\x03\x00', b'\x00\x00'):
            kind[i] = 'sfx'
        else:
            kind[i] = 'core'

    patch_lump = {lumps[i][0]: i for i in kind if kind[i] == 'patch'}

    # A wall with no texture is given texture number 0, so the engine counts
    # that texture as used by every level and loads it with each one. Its
    # patches go in the core rather than with whichever level names it first.
    for patch in textures[order[0]]:
        if patch in patch_lump:
            kind[patch_lump.pop(patch)] = 'core'

    # --- what each level needs beyond the core
    def level_patches(number):
        parts = maps[number]['parts']
        used = set()
        sides = parts['SIDEDEFS']
        for k in range(len(sides) // 30):
            for off in (4, 12, 20):
                tex = name8(sides[k * 30 + off:k * 30 + off + 8])
                if tex != '-':
                    used.add(tex)
        # the engine picks the sky by level number
        used.add('SKY1' if number < 12 else 'SKY2' if number < 21 else 'SKY3')
        for tex in list(used):
            used |= family.get(tex, set())
        out = set()
        for tex in used:
            for patch in textures.get(tex, []):
                if patch in patch_lump:
                    out.add(patch_lump[patch])
        return out

    packs = [{'name': 'core', 'lumps': [i for i in sorted(kind) if kind[i] == 'core']},
             {'name': 'sfx', 'lumps': [i for i in sorted(kind) if kind[i] == 'sfx']}]
    home = {}       # patch lump -> pack index
    levels = {}
    for number in maps:
        pack_index = len(packs)
        need = level_patches(number)
        fresh = sorted(p for p in need if p not in home)
        for p in fresh:
            home[p] = pack_index
        packs.append({'name': f'm{number:02d}', 'lumps': maps[number]['lumps'] + fresh})
        levels[number] = sorted({pack_index} | {home[p] for p in need})
    unused = sorted(i for i in kind if kind[i] == 'patch' and i not in home)
    if unused:
        packs.append({'name': 'extra', 'lumps': unused})

    # --- lay each pack out, and note where every stretch of the WAD ended up
    # The core also carries the header, the directory and the few bytes of
    # padding between lumps that belong to nobody: with those, the packs
    # put back together are the original file exactly.
    covered = sorted([(0, 12), (directory, len(wad) - directory)]
                     + [(pos, size) for _, pos, size in lumps if size > 0])
    extras = [(0, 12), (directory, len(wad) - directory)]
    for (pos, size), (nxt, _) in zip(covered, covered[1:]):
        if pos + size > nxt:
            sys.exit(f'lumps overlap at {nxt}; this WAD needs a smarter packer')
        if pos + size < nxt:
            extras.append((pos + size, nxt - pos - size))

    ranges = []
    for pack_index, pack in enumerate(packs):
        blob = bytearray()
        pieces = [(lumps[i][1], lumps[i][2]) for i in pack['lumps'] if lumps[i][2] > 0]
        for pos, size in (extras if pack_index == 0 else []) + pieces:
            ranges.append((pos, size, pack_index, len(blob)))
            blob += wad[pos:pos + size]
        pack['data'] = bytes(blob)
    ranges.sort()
    if sum(r[1] for r in ranges) != len(wad):
        sys.exit('the packs do not account for every byte of the WAD')
    return packs, ranges, levels


def build(path):
    wad = open(path, 'rb').read()
    packs, ranges, levels = plan(wad)
    os.makedirs(DATA, exist_ok=True)
    for old in os.listdir(DATA):
        if old.endswith('.lzma') or old.endswith('.wad.gz'):
            os.remove(os.path.join(DATA, old))

    manifest = {
        'wad': {'name': 'freedoom2.wad', 'size': len(wad), 'sha256': hashlib.sha256(wad).hexdigest()},
        'packs': [],
        'levels': {str(k): v for k, v in levels.items()},
        'ranges': [n for r in ranges for n in r],
    }
    total = 0
    for pack in packs:
        raw = pack['data']
        packed = lzma.compress(raw, format=lzma.FORMAT_ALONE, preset=9 | lzma.PRESET_EXTREME)
        digest = hashlib.sha256(packed).hexdigest()
        # the name carries the hash: a new build is a new URL, so the long
        # cache lifetime on data/ can never serve a stale pack
        filename = f"{pack['name']}.{digest[:10]}.lzma"
        with open(os.path.join(DATA, filename), 'wb') as f:
            f.write(packed)
        manifest['packs'].append({'name': pack['name'], 'file': filename, 'bytes': len(packed),
                                  'size': len(raw), 'sha256': digest})
        total += len(packed)
        print(f"  {pack['name']:6} {len(pack['lumps']):5} lumps  {len(raw) / 1e6:6.2f} MB -> {len(packed) / 1e6:5.2f} MB")
    with open(MANIFEST, 'w') as f:
        json.dump(manifest, f, separators=(',', ':'))
        f.write('\n')
    first = manifest['packs'][0]['bytes']
    level1 = sum(manifest['packs'][i]['bytes'] for i in levels[1])
    print(f'total {total / 1e6:.2f} MB in {len(packs)} packs')
    print(f'to the title screen: {first / 1e6:.2f} MB; to playing level 1: {(first + level1) / 1e6:.2f} MB')


def rebuild():
    manifest = json.load(open(MANIFEST))
    wad = bytearray(manifest['wad']['size'])
    blobs = []
    for pack in manifest['packs']:
        packed = open(os.path.join(DATA, pack['file']), 'rb').read()
        if hashlib.sha256(packed).hexdigest() != pack['sha256'] or len(packed) != pack['bytes']:
            sys.exit(f"{pack['file']} does not match packs.json")
        raw = lzma.decompress(packed, format=lzma.FORMAT_ALONE)
        if len(raw) != pack['size']:
            sys.exit(f"{pack['file']} unpacks to the wrong size")
        blobs.append(raw)
    flat = manifest['ranges']
    for k in range(0, len(flat), 4):
        pos, size, pack, offset = flat[k:k + 4]
        wad[pos:pos + size] = blobs[pack][offset:offset + size]
    if hashlib.sha256(wad).hexdigest() != manifest['wad']['sha256']:
        sys.exit('the rebuilt WAD does not match the original')
    return bytes(wad), manifest


def main(argv):
    if len(argv) == 3 and argv[1] == 'build':
        build(argv[2])
    elif len(argv) == 2 and argv[1] == 'verify':
        wad, manifest = rebuild()
        print(f"ok: {len(manifest['packs'])} packs rebuild {manifest['wad']['name']}, sha256 {manifest['wad']['sha256']}")
    elif len(argv) == 3 and argv[1] == 'unpack':
        wad, _ = rebuild()
        open(argv[2], 'wb').write(wad)
        print(f'wrote {argv[2]}')
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main(sys.argv)
