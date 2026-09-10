#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Session Zero audio baker  (russian/tools/gen_audio.py).

Reads ``russian/data/session0.js``, finds every object that carries an
``audio`` key, and synthesises two takes of its Russian text with Microsoft
Edge's neural voices via ``edge-tts`` (free, no key, nothing at runtime):

    audio/s0/<key>.mp3         normal take   (rate +0%)
    audio/s0/<key>.slow.mp3    slow take     (rate -30%, *regenerated*, never
                                              time-stretched - PLAN_AUDIT 7)
    audio/s0/manifest.json     CONTRACT 1.4 shape, plus per-clip hashes

Usage
-----
    python russian/tools/gen_audio.py                  # incremental
    python russian/tools/gen_audio.py --force          # rebuild everything
    python russian/tools/gen_audio.py --only s0.r1     # one beat
    python russian/tools/gen_audio.py --dry-run        # plan only, no network

WHY THE .js IS PARSED DIRECTLY, NOT VIA A JSON SIDECAR
------------------------------------------------------
``data/session0.js`` is the source of truth: ``index.html`` loads it as a
plain ``<script>`` (no bundler, no npm - PLAN_AUDIT 10), so it must stay
valid JS.  A JSON sidecar would be a second copy that has to be regenerated
after every content edit and goes stale the first time someone forgets -
exactly the class of bug these tools exist to catch.  So the tools read the
.js directly with a small tolerant reader (below) that accepts the JS-isms
JSON does not: unquoted keys, single quotes, trailing commas, ``//`` and
``/* */`` comments, backtick strings, ``"a" + "b"``.  Anything more exotic
(a function call, a variable reference) is a hard error, which keeps the data
files honestly declarative.  ``--emit-json`` dumps the parsed tree if you
want to eyeball what the tools actually see.

GOTCHAS THAT COST REAL DEBUGGING TIME - DO NOT "TIDY" THESE AWAY
----------------------------------------------------------------
1. edge-tts 7.x signature is
   ``Communicate(text, voice, *, rate, volume, pitch, boundary, connector,
   proxy, connect_timeout, receive_timeout)`` and **boundary defaults to
   "SentenceBoundary"**.  Without an explicit ``boundary="WordBoundary"`` you
   get one metadata chunk per sentence, and per-word highlighting /
   click-a-word replay silently degrades to nothing.  That single keyword is
   the most important line in this file.
2. The combining acute U+0301 measurably changes synthesis and is echoed back
   inside the WordBoundary ``text``.  It is kept in what we send and in what
   we store.  Do not "clean" the input.
3. Windows consoles default to cp1252 and crash on Cyrillic output, so stdout
   and stderr are reconfigured to UTF-8 at import.
4. ffmpeg is NOT installed and is NOT used.  The service returns
   ``audio-24khz-48kbitrate-mono-mp3``; those bytes are written straight to
   disk and the duration is measured by walking the MPEG frame headers.
5. ``Communicate.stream()`` may be consumed only once per instance, so every
   retry constructs a fresh ``Communicate``.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import random
import re
import sys
import time
from pathlib import Path

# --- gotcha 3: cp1252 consoles die on Cyrillic ------------------------------
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    except Exception:  # pragma: no cover - very old / redirected streams
        pass


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent          # russian/
ANYA_VOICE = "ru-RU-SvetlanaNeural"                    # Аня, for the whole course
MALE_VOICE = "ru-RU-DmitryNeural"                      # male NPCs
NORMAL_RATE = "+0%"
SLOW_RATE = "-30%"
TICKS_PER_SECOND = 10_000_000.0                        # edge-tts metadata unit

# Bumped whenever the *generation* changes in a way that invalidates cached
# clips (voice defaults, rate, output format, manifest shape).  It is part of
# the per-clip hash, so bumping it forces a rebuild without --force.
FORMAT_VERSION = "s0-audio-1"

# `who` values that should speak with the male voice.  Аня, the narrator and
# the learner's own read-back lines all stay on the single locked female voice
# (PLAN_AUDIT 4: "Her voice is one voice for the whole course").
MALE_WHO = {
    "dmitry", "dmitri", "npc", "man", "male", "barista", "waiter", "landlord",
    "stranger", "cashier", "conductor", "neighbour", "neighbor", "clerk",
}

# Where a clip's Russian text is looked for, in order.  `stressed` first: the
# acute is what steers the synthesiser, and CONTRACT 1.4 stores the stressed
# string as the manifest `text`.
TEXT_FIELDS = ("stressed", "ru", "text", "word", "lower")

SAFE_KEY_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


# ---------------------------------------------------------------------------
# Tolerant reader for the JS data files
# ---------------------------------------------------------------------------

class JsParseError(Exception):
    """The .js data file is not declarative enough for the tools to read."""


_IDENT_RE = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*")
_KEY_RE = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*|[0-9]+")
_NUM_RE = re.compile(
    r"[+-]?(?:0[xX][0-9a-fA-F]+|(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)"
)
_WS = " \t\r\n\f\v\u00a0\ufeff"


class JsReader(object):
    """Recursive-descent reader for JSON5-ish JS literals."""

    def __init__(self, text, origin="<js>"):
        self.s = text
        self.i = 0
        self.n = len(text)
        self.origin = origin

    # -- errors ------------------------------------------------------------
    def err(self, msg):
        line = self.s.count("\n", 0, self.i) + 1
        col = self.i - (self.s.rfind("\n", 0, self.i) + 1) + 1
        raise JsParseError("%s:%d:%d: %s" % (self.origin, line, col, msg))

    # -- lexing ------------------------------------------------------------
    def ws(self):
        """Skip whitespace and both comment forms."""
        s, n = self.s, self.n
        while self.i < n:
            c = s[self.i]
            if c in _WS:
                self.i += 1
            elif c == "/" and self.i + 1 < n and s[self.i + 1] == "/":
                j = s.find("\n", self.i)
                self.i = n if j < 0 else j + 1
            elif c == "/" and self.i + 1 < n and s[self.i + 1] == "*":
                j = s.find("*/", self.i + 2)
                if j < 0:
                    self.err("unterminated /* block comment")
                self.i = j + 2
            else:
                return

    def string(self):
        quote = self.s[self.i]
        self.i += 1
        out = []
        while True:
            if self.i >= self.n:
                self.err("unterminated string literal")
            c = self.s[self.i]
            if c == quote:
                self.i += 1
                return "".join(out)
            if c == "\\":
                self.i += 1
                if self.i >= self.n:
                    self.err("unterminated escape sequence")
                e = self.s[self.i]
                self.i += 1
                simple = {"n": "\n", "t": "\t", "r": "\r", "b": "\b",
                          "f": "\f", "v": "\v", "0": "\0"}
                if e in simple:
                    out.append(simple[e])
                elif e == "x":
                    try:
                        out.append(chr(int(self.s[self.i:self.i + 2], 16)))
                    except ValueError:
                        self.err("bad \\x escape")
                    self.i += 2
                elif e == "u":
                    if self.i < self.n and self.s[self.i] == "{":
                        j = self.s.find("}", self.i)
                        if j < 0:
                            self.err("bad \\u{...} escape")
                        try:
                            out.append(chr(int(self.s[self.i + 1:j], 16)))
                        except ValueError:
                            self.err("bad \\u{...} escape")
                        self.i = j + 1
                    else:
                        try:
                            out.append(chr(int(self.s[self.i:self.i + 4], 16)))
                        except ValueError:
                            self.err("bad \\u escape")
                        self.i += 4
                elif e == "\n":
                    pass  # line continuation
                else:
                    out.append(e)
                continue
            if c == "\n" and quote != "`":
                self.err("raw newline inside a '%s' string" % quote)
            if quote == "`" and c == "$" and self.i + 1 < self.n and self.s[self.i + 1] == "{":
                self.err("template interpolation is not allowed in data files")
            out.append(c)
            self.i += 1

    def number(self):
        m = _NUM_RE.match(self.s, self.i)
        if not m:
            self.err("expected a number")
        raw = m.group(0)
        self.i = m.end()
        try:
            if raw[-1:].lower() == "x" or "x" in raw.lower():
                return int(raw, 16)
            if "." in raw or "e" in raw.lower():
                return float(raw)
            return int(raw)
        except ValueError:
            self.err("bad number %r" % raw)

    def word(self):
        m = _IDENT_RE.match(self.s, self.i)
        if not m:
            self.err("unexpected character %r" % self.s[self.i])
        raw = m.group(0)
        self.i = m.end()
        if raw == "true":
            return True
        if raw == "false":
            return False
        if raw in ("null", "undefined"):
            return None
        if raw == "NaN":
            return float("nan")
        if raw == "Infinity":
            return float("inf")
        self.err("the data files must be declarative; found identifier %r" % raw)

    # -- values ------------------------------------------------------------
    def value(self):
        self.ws()
        if self.i >= self.n:
            self.err("unexpected end of input")
        c = self.s[self.i]
        if c == "{":
            v = self.object()
        elif c == "[":
            v = self.array()
        elif c in "\"'`":
            v = self.string()
        elif c.isdigit() or c in "+-" or (c == "." and self.i + 1 < self.n and self.s[self.i + 1].isdigit()):
            v = self.number()
        else:
            v = self.word()
        # "a" + "b" concatenation, so long lines can be broken up by hand.
        if isinstance(v, str):
            save = self.i
            self.ws()
            if self.i < self.n and self.s[self.i] == "+":
                self.i += 1
                rhs = self.value()
                if not isinstance(rhs, str):
                    self.err("only strings may be concatenated with +")
                return v + rhs
            self.i = save
        return v

    def object(self):
        self.i += 1  # consume {
        out = {}
        while True:
            self.ws()
            if self.i >= self.n:
                self.err("unterminated object literal")
            c = self.s[self.i]
            if c == "}":
                self.i += 1
                return out
            if c == ",":          # tolerate trailing / doubled commas
                self.i += 1
                continue
            if c in "\"'`":
                key = self.string()
            elif c == "[":
                self.err("computed property keys are not allowed in data files")
            else:
                m = _KEY_RE.match(self.s, self.i)
                if not m:
                    self.err("expected a property name")
                key = m.group(0)
                self.i = m.end()
            self.ws()
            if self.i >= self.n or self.s[self.i] != ":":
                self.err("expected ':' after key %r" % key)
            self.i += 1
            out[key] = self.value()
            self.ws()
            if self.i < self.n and self.s[self.i] == ",":
                self.i += 1

    def array(self):
        self.i += 1  # consume [
        out = []
        while True:
            self.ws()
            if self.i >= self.n:
                self.err("unterminated array literal")
            c = self.s[self.i]
            if c == "]":
                self.i += 1
                return out
            if c == ",":
                self.i += 1
                continue
            out.append(self.value())
            self.ws()
            if self.i < self.n and self.s[self.i] == ",":
                self.i += 1


_ASSIGN_RE = re.compile(
    r"(?:window\s*\.\s*)?RU\s*\.\s*([A-Za-z_$][A-Za-z0-9_$]*)"
    r"((?:\s*\.\s*[A-Za-z_$][A-Za-z0-9_$]*)*)\s*="
)


def _first_literal_index(text, start):
    """Index of the first `{` or `[` after `start`, skipping strings/comments.

    Lets us cope with `RU.LEXICON = RU.LEXICON || { ... }` and
    `RU.X = Object.assign(RU.X, { ... })` without a real JS engine.  Stops at
    the statement terminator so we never wander into the next statement.
    """
    i, n = start, len(text)
    while i < n:
        c = text[i]
        if c in "{[":
            return i
        if c == ";":
            return None
        if c in "\"'`":
            q = c
            i += 1
            while i < n and text[i] != q:
                i += 2 if text[i] == "\\" else 1
            i += 1
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "/":
            j = text.find("\n", i)
            i = n if j < 0 else j + 1
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "*":
            j = text.find("*/", i + 2)
            i = n if j < 0 else j + 2
            continue
        i += 1
    return None


def parse_ru_globals(text, origin, names):
    """Collect the `RU.<name>` globals assigned anywhere in `text`.

    Handles the three shapes an author might reasonably write:
        RU.SESSION0 = { ... };
        RU.SESSION0 = {};  RU.SESSION0.nodes = [ ... ];
        RU.LEXICON = Object.assign(RU.LEXICON || {}, { ... });
    """
    found = {}
    for m in _ASSIGN_RE.finditer(text):
        name = m.group(1)
        if name not in names:
            continue
        path = [p.strip() for p in m.group(2).split(".") if p.strip()]
        reader = JsReader(text, origin)
        reader.i = m.end()
        reader.ws()
        if reader.i >= reader.n:
            continue
        if text[reader.i] not in "{[\"'`" and not text[reader.i].isdigit():
            j = _first_literal_index(text, reader.i)
            if j is None:
                continue
            reader.i = j
        value = reader.value()
        if not path:
            prev = found.get(name)
            if isinstance(prev, dict) and isinstance(value, dict):
                prev.update(value)
            else:
                found[name] = value
        else:
            container = found.setdefault(name, {})
            for key in path[:-1]:
                if not isinstance(container, dict):
                    break
                container = container.setdefault(key, {})
            if isinstance(container, dict):
                container[path[-1]] = value
    return found


def load_session(path):
    if not path.exists():
        raise SystemExit("gen_audio: %s not found" % path)
    text = path.read_text(encoding="utf-8-sig")
    globs = parse_ru_globals(text, str(path), {"SESSION0"})
    if "SESSION0" not in globs:
        raise SystemExit("gen_audio: no `RU.SESSION0 = ...` assignment in %s" % path)
    return globs["SESSION0"]


# ---------------------------------------------------------------------------
# mp3 duration without ffmpeg
# ---------------------------------------------------------------------------

_BITRATES = {
    # (mpeg version id, layer III)
    1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, None],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, None],
}
_SAMPLE_RATES = {1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 3: [11025, 12000, 8000]}


def mp3_duration(data):
    """Duration in seconds, by walking MPEG audio frame headers.

    edge-tts returns audio-24khz-48kbitrate-mono-mp3 (MPEG-2 Layer III, 576
    samples per frame, 144-byte frames -> 6000 bytes/second), but the header
    walk keeps this honest if the service ever changes format.  Falls back to
    the CBR byte estimate, then to 0.0, and never raises.
    """
    try:
        i, n = 0, len(data)
        if data[:3] == b"ID3" and n > 10:
            size = 0
            for b in data[6:10]:
                size = (size << 7) | (b & 0x7F)
            i = 10 + size
        seconds = 0.0
        frames = 0
        while i + 4 <= n:
            if data[i] != 0xFF or (data[i + 1] & 0xE0) != 0xE0:
                i += 1                      # resync
                continue
            ver_bits = (data[i + 1] >> 3) & 0x03      # 0=2.5, 2=2, 3=1
            layer_bits = (data[i + 1] >> 1) & 0x03    # 1 = Layer III
            if layer_bits != 1 or ver_bits == 1:
                i += 1
                continue
            version = {0: 3, 2: 2, 3: 1}[ver_bits]    # 3 == MPEG 2.5 here
            br_idx = (data[i + 2] >> 4) & 0x0F
            sr_idx = (data[i + 2] >> 2) & 0x03
            padding = (data[i + 2] >> 1) & 0x01
            if br_idx in (0, 15) or sr_idx == 3:
                i += 1
                continue
            bitrate = _BITRATES[1 if version == 1 else 2][br_idx]
            samplerate = _SAMPLE_RATES[version][sr_idx]
            if not bitrate or not samplerate:
                i += 1
                continue
            spf = 1152 if version == 1 else 576
            frame_len = int((spf // 8) * bitrate * 1000 / samplerate) + padding
            if frame_len <= 4:
                i += 1
                continue
            seconds += float(spf) / samplerate
            frames += 1
            i += frame_len
        if frames:
            return round(seconds, 3)
    except Exception:
        pass
    if data:
        return round(len(data) * 8.0 / 48000.0, 3)   # 48 kbps CBR fallback
    return 0.0


# ---------------------------------------------------------------------------
# Clip discovery
# ---------------------------------------------------------------------------

class Clip(object):
    __slots__ = ("key", "text", "voice", "node_id", "path")

    def __init__(self, key, text, voice, node_id, path):
        self.key = key
        self.text = text
        self.voice = voice
        self.node_id = node_id
        self.path = path


def resolve_voice(ctx, default_voice):
    """Pick the voice for a clip from the nearest enclosing node's context.

    An explicit `voice` field wins (full voice id, or "male"/"female"), then
    `who`; otherwise the locked Аня voice.
    """
    raw = ctx.get("voice")
    if isinstance(raw, str) and raw.strip():
        v = raw.strip()
        if "Neural" in v or v.count("-") >= 2:
            return v
        low = v.lower()
        if low in ("male", "m", "dmitry", "dmitri"):
            return MALE_VOICE
        if low in ("female", "f", "svetlana", "anya"):
            return ANYA_VOICE
    who = ctx.get("who")
    if isinstance(who, str) and who.strip().lower() in MALE_WHO:
        return MALE_VOICE
    return default_voice


def collect_clips(session, default_voice):
    """Walk the whole session tree and return (ordered clips, problems).

    Anything with a non-empty string `audio` field is a clip: line nodes,
    exercise `prompt` objects, choices, retrieval variant nodes, weblab
    questions.  Walking generically rather than by node type means a new node
    shape gets audio for free instead of silently getting none.
    """
    clips = {}
    order = []
    problems = []

    def visit(obj, ctx, path):
        if isinstance(obj, list):
            for idx, item in enumerate(obj):
                visit(item, ctx, "%s[%d]" % (path, idx))
            return
        if not isinstance(obj, dict):
            return

        local = dict(ctx)
        if isinstance(obj.get("who"), str):
            local["who"] = obj["who"]
        if isinstance(obj.get("voice"), str):
            local["voice"] = obj["voice"]
        node_id = obj.get("id")
        if isinstance(node_id, str) and node_id.startswith("s0."):
            local["nodeId"] = node_id

        key = obj.get("audio")
        if isinstance(key, str) and key.strip():
            key = key.strip()
            text = ""
            for field in TEXT_FIELDS:
                candidate = obj.get(field)
                if isinstance(candidate, str) and candidate.strip():
                    text = candidate.strip()
                    break
            voice = resolve_voice(local, default_voice)
            if not text:
                problems.append("%s: audio key %r has no %s text" %
                                (path, key, "/".join(TEXT_FIELDS)))
            elif not SAFE_KEY_RE.match(key):
                problems.append("%s: audio key %r is not a safe file name" % (path, key))
            else:
                prev = clips.get(key)
                if prev is None:
                    clips[key] = Clip(key, text, voice, local.get("nodeId"), path)
                    order.append(key)
                elif prev.text != text or prev.voice != voice:
                    problems.append(
                        "duplicate audio key %r with conflicting text/voice "
                        "(%s vs %s)" % (key, prev.path, path))

        for field, sub in obj.items():
            if field == "audio":
                continue
            visit(sub, local, "%s.%s" % (path, field))

    visit(session, {}, "SESSION0")
    return [clips[k] for k in order], problems


# ---------------------------------------------------------------------------
# Synthesis
# ---------------------------------------------------------------------------

def clip_hash(text, voice, rate):
    h = hashlib.sha256()
    for part in (FORMAT_VERSION, text, voice, rate):
        h.update(part.encode("utf-8"))
        h.update(b"\x00")
    return h.hexdigest()[:16]


def _edge_tts():
    """Imported lazily so --dry-run works on a machine without edge-tts."""
    try:
        import edge_tts  # noqa: WPS433 (deliberate local import)
    except ImportError:
        raise SystemExit(
            "gen_audio: edge-tts is not installed.  `pip install edge-tts` "
            "(7.x), or run with --dry-run.")
    return edge_tts


async def synthesise(text, voice, rate, attempts, timeout):
    """One take.  Returns (mp3 bytes, word timings).  Retries with backoff."""
    edge_tts = _edge_tts()
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            # *** THE GOTCHA ***  boundary defaults to "SentenceBoundary" in
            # edge-tts 7.x.  Without boundary="WordBoundary" there are no
            # per-word timings and speech.js loses word highlighting and
            # replayWord() entirely.  The combining acute U+0301 stays in
            # `text`: it steers the synthesiser and comes back in chunk texts.
            comm = edge_tts.Communicate(
                text,
                voice,
                rate=rate,
                boundary="WordBoundary",
                connect_timeout=timeout,
                receive_timeout=timeout,
            )
            audio = bytearray()
            words = []
            # stream() is single-use per Communicate, hence the rebuild above.
            async for chunk in comm.stream():
                kind = chunk.get("type")
                if kind == "audio":
                    data = chunk.get("data")
                    if data:
                        audio.extend(data)
                elif kind == "WordBoundary":
                    words.append({
                        "t": round(float(chunk.get("offset", 0)) / TICKS_PER_SECOND, 3),
                        "d": round(float(chunk.get("duration", 0)) / TICKS_PER_SECOND, 3),
                        "w": chunk.get("text", ""),
                    })
            if not audio:
                raise RuntimeError("service returned no audio")
            return bytes(audio), words
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # the service does drop connections
            last_error = exc
            if attempt >= attempts:
                break
            await asyncio.sleep(min(8.0, 0.8 * (2 ** (attempt - 1))) + random.random() * 0.4)
    raise RuntimeError("%s: %s" % (type(last_error).__name__, last_error))


class Runner(object):
    def __init__(self, args, out_dir, previous):
        self.args = args
        self.out_dir = out_dir
        self.previous = previous
        self.sem = asyncio.Semaphore(args.jobs)
        self.entries = {}
        self.generated = 0
        self.skipped = 0
        self.failed = []
        self.takes = 0

    def _plan(self, clip):
        """Which of the two takes need (re)generating, and why."""
        entry = self.previous.get(clip.key) or {}
        want_normal = clip_hash(clip.text, clip.voice, NORMAL_RATE)
        want_slow = clip_hash(clip.text, clip.voice, self.args.slow_rate)
        normal_file = self.out_dir / (clip.key + ".mp3")
        slow_file = self.out_dir / (clip.key + ".slow.mp3")
        complete = isinstance(entry.get("words"), list) and entry.get("dur")
        need_normal = (self.args.force or entry.get("hash") != want_normal
                       or not normal_file.exists() or not complete)
        need_slow = (self.args.force or entry.get("slowHash") != want_slow
                     or not slow_file.exists())
        return entry, want_normal, want_slow, need_normal, need_slow

    async def run_clip(self, clip):
        entry, want_normal, want_slow, need_normal, need_slow = self._plan(clip)
        base = {
            "file": clip.key + ".mp3",
            "slow": clip.key + ".slow.mp3",
            "text": clip.text,
            "voice": clip.voice,
            "rate": NORMAL_RATE,
            "slowRate": self.args.slow_rate,
            "dur": entry.get("dur", 0.0),
            "words": entry.get("words", []),
            "slowDur": entry.get("slowDur", 0.0),
            "slowWords": entry.get("slowWords", []),
            "hash": entry.get("hash"),
            "slowHash": entry.get("slowHash"),
        }

        if not need_normal and not need_slow:
            self.entries[clip.key] = base
            self.skipped += 1
            print("  skip  %-14s %s" % (clip.key, _short(clip.text)))
            return

        if self.args.dry_run:
            self.entries[clip.key] = base
            self.generated += 1
            what = "+".join([w for w, need in (("normal", need_normal), ("slow", need_slow)) if need])
            print("  plan  %-14s %-6s %-22s %s" % (clip.key, what, clip.voice, _short(clip.text)))
            return

        async with self.sem:                      # 4 concurrent sockets
            try:
                if need_normal:
                    audio, words = await synthesise(
                        clip.text, clip.voice, NORMAL_RATE,
                        self.args.attempts, self.args.timeout)
                    (self.out_dir / base["file"]).write_bytes(audio)
                    dur = mp3_duration(audio)
                    if not dur and words:
                        dur = round(max(w["t"] + w["d"] for w in words), 3)
                    base["dur"] = dur
                    base["words"] = words
                    base["hash"] = want_normal
                    self.takes += 1
                if need_slow:
                    audio, words = await synthesise(
                        clip.text, clip.voice, self.args.slow_rate,
                        self.args.attempts, self.args.timeout)
                    (self.out_dir / base["slow"]).write_bytes(audio)
                    slow_dur = mp3_duration(audio)
                    if not slow_dur and words:
                        slow_dur = round(max(w["t"] + w["d"] for w in words), 3)
                    base["slowDur"] = slow_dur
                    base["slowWords"] = words
                    base["slowHash"] = want_slow
                    self.takes += 1
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self.failed.append((clip.key, str(exc)))
                if entry:
                    self.entries[clip.key] = entry   # keep the last good take
                print("  FAIL  %-14s %s" % (clip.key, exc))
                return

        self.entries[clip.key] = base
        self.generated += 1
        if not base["words"]:
            print("  warn  %-14s no word boundaries returned "
                  "(check boundary=\"WordBoundary\")" % clip.key)
        print("  ok    %-14s %5.2fs  %2d words  %s"
              % (clip.key, base["dur"], len(base["words"]), _short(clip.text)))

    async def run(self, clips):
        await asyncio.gather(*[self.run_clip(c) for c in clips])


def _short(text, width=38):
    text = " ".join(text.split())
    return text if len(text) <= width else text[:width - 1] + "…"


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def parse_args(argv):
    p = argparse.ArgumentParser(
        description="Bake Session Zero's Аня clips with edge-tts.")
    p.add_argument("--root", default=str(ROOT),
                   help="the russian/ directory (default: alongside this script)")
    p.add_argument("--session", default=None, help="override data/session0.js")
    p.add_argument("--out", default=None, help="override audio/s0")
    p.add_argument("--force", action="store_true",
                   help="regenerate every clip, ignoring hashes")
    p.add_argument("--only", action="append", default=[], metavar="PREFIX",
                   help="only clips whose key starts with PREFIX (repeatable)")
    p.add_argument("--dry-run", action="store_true",
                   help="print the plan, touch nothing, make no network calls")
    p.add_argument("--jobs", type=int, default=4, help="concurrent clips (default 4)")
    p.add_argument("--attempts", type=int, default=3,
                   help="attempts per take before giving up (default 3)")
    p.add_argument("--timeout", type=int, default=30,
                   help="per-connection timeout in seconds (default 30)")
    p.add_argument("--voice", default=ANYA_VOICE, help="default voice (Аня)")
    p.add_argument("--slow-rate", default=SLOW_RATE, help="slow take rate (default -30%%)")
    p.add_argument("--prune", action="store_true",
                   help="also delete .mp3 files no longer referenced")
    p.add_argument("--emit-json", default=None, metavar="PATH",
                   help="dump the parsed session0 tree as JSON and exit")
    return p.parse_args(argv)


def main(argv=None):
    args = parse_args(sys.argv[1:] if argv is None else argv)
    root = Path(args.root).resolve()
    session_path = Path(args.session) if args.session else root / "data" / "session0.js"
    out_dir = Path(args.out) if args.out else root / "audio" / "s0"
    manifest_path = out_dir / "manifest.json"

    session = load_session(session_path)

    if args.emit_json:
        target = Path(args.emit_json)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(session, ensure_ascii=False, indent=1) + "\n",
                          encoding="utf-8")
        print("wrote %s" % target)
        return 0

    clips, problems = collect_clips(session, args.voice)
    for problem in problems:
        print("  data  %s" % problem)

    if args.only:
        wanted = [c for c in clips if any(c.key.startswith(p) for p in args.only)]
    else:
        wanted = clips

    # The old manifest is ALWAYS read, even under --force: entries for clips
    # this run did not select (--only) have to be carried over or a targeted
    # rebuild would silently delete the rest of the session's audio.  --force
    # is honoured in Runner._plan, where it belongs.
    previous = {}
    if manifest_path.exists():
        try:
            previous = (json.loads(manifest_path.read_text(encoding="utf-8"))
                        .get("clips") or {})
        except Exception as exc:
            print("  warn  ignoring unreadable manifest (%s)" % exc)

    print("session   %s" % session_path)
    print("clips     %d referenced, %d selected" % (len(clips), len(wanted)))
    print("out       %s" % out_dir)
    print("")

    if not args.dry_run:
        out_dir.mkdir(parents=True, exist_ok=True)

    runner = Runner(args, out_dir, previous)
    try:
        asyncio.run(runner.run(wanted))
    except KeyboardInterrupt:
        print("\ninterrupted - writing the manifest for what finished")

    # Rebuild the manifest in session order.  Entries for clips that were not
    # selected this run are carried over unchanged; entries for keys the
    # content no longer references are dropped, because CONTRACT lint rule 2
    # requires every manifest entry to be referenced.
    referenced = set(c.key for c in clips)
    out_clips = {}
    for clip in clips:
        if clip.key in runner.entries:
            out_clips[clip.key] = runner.entries[clip.key]
        elif clip.key in previous:
            out_clips[clip.key] = previous[clip.key]
    orphans = sorted(k for k in previous if k not in referenced)

    # Orphan *files* are found by scanning, not by diffing the manifest: once
    # a renamed key has been dropped from the manifest its .mp3 would other-
    # wise be unreachable forever.
    orphan_files = []
    if out_dir.exists():
        for stale in sorted(out_dir.glob("*.mp3")):
            name = stale.name
            key = name[:-9] if name.endswith(".slow.mp3") else name[:-4]
            if key not in referenced:
                orphan_files.append(stale)

    # SESSION0 is normally an object (it also carries the letter registry),
    # but CONTRACT 1.3 says "a session is an ordered array of nodes", so a bare
    # array has to survive too.
    meta = session if isinstance(session, dict) else {}

    manifest = {
        "version": 1,
        "voice": args.voice,
        "contentVersion": meta.get("contentVersion") or meta.get("version") or "s0.1",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "rate": NORMAL_RATE,
        "slowRate": args.slow_rate,
        "clips": out_clips,
    }

    if not args.dry_run:
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        if args.prune:
            for stale in orphan_files:
                stale.unlink()

    print("")
    print("generated %d clip(s), %d take(s)" % (runner.generated, runner.takes))
    print("skipped   %d clip(s) (unchanged hash)" % runner.skipped)
    print("failed    %d clip(s)" % len(runner.failed))
    for key, err in runner.failed:
        print("          %-14s %s" % (key, err))
    if orphans:
        print("orphans   %d manifest entry/entries dropped: %s"
              % (len(orphans), ", ".join(orphans)))
    if orphan_files:
        print("stale     %d unreferenced mp3 file(s)%s: %s"
              % (len(orphan_files), " deleted" if args.prune and not args.dry_run
                 else " (pass --prune to delete)",
                 ", ".join(f.name for f in orphan_files)))
    if args.dry_run:
        print("(dry run - nothing was written and no audio was requested)")
    else:
        print("manifest  %s" % manifest_path)

    if problems or runner.failed:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
