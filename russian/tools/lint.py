#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Session Zero content lint  (russian/tools/lint.py).

Implements the ten rules frozen in CONTRACT.md section 4, one named check
function each, so a failure says *which rule* broke and *where*.

    python russian/tools/lint.py                # human report, exit 1 on any violation
    python russian/tools/lint.py --json         # machine-readable
    python russian/tools/lint.py --stats        # curriculum numbers (PLAN_AUDIT 6.2)
    python russian/tools/lint.py --skip-audio   # before gen_audio.py has ever run

Inputs, all optional to override:
    data/session0.js   -> RU.SESSION0
    data/lexicon.js    -> RU.LEXICON
    audio/s0/manifest.json

WHY THE .js IS PARSED DIRECTLY, NOT VIA A JSON SIDECAR
------------------------------------------------------
The .js files are the source of truth loaded by index.html as plain
<script>s (no bundler, no npm - PLAN_AUDIT 10).  A JSON sidecar would be a
second copy that goes stale the first time somebody edits the content and
forgets to regenerate it, and a lint that reads the stale copy is worse than
no lint.  So this reads the .js with a small tolerant reader that accepts
unquoted keys, single quotes, trailing commas, comments, backticks and
"a" + "b", and rejects anything non-declarative.  The reader is duplicated in
gen_audio.py on purpose: each tool must run standalone from a fresh checkout.

INTERPRETATIONS OF THE CONTRACT, MADE EXPLICIT
----------------------------------------------
* "Learner-decodable" (rule 1, and CONTRACT 4 rule 1 now spells this out) =
  exercise `choices[].ru`, letter-drill word lists, and the Russian text of a
  `weblab` page - the things the learner reads off the screen.  It is NOT
  `ru`/`stressed` on spoken lines, NOT exercise `prompt` text (CONTRACT 1.3's
  own example prompt is "Что это?", which contains Ч and Э - it is heard, not
  decoded), NOT `hint` (CONTRACT 1.3's example hint is "Она показывает на
  нос.", likewise untaught letters), and NOT `accept` members, which are
  production targets the learner types and the UI never displays - that is
  what makes beat 4's "Это кот" authorable while Э is untaught.  See the
  notes at DECODABLE_KEYS.
* Rule 1 has two authored opt-outs, both required by CONTRACT 4 rule 1:
  a node carrying `decodable:false` is skipped entirely, and inside a weblab
  page any element carrying data-ru-noise="true" is skipped.
* A `letters` node may use the letters it itself teaches in its own drill
  words; every other node sees only letters taught by *earlier* nodes.
* Rule 3 is applied per Russian word inside a `stressed` string, and a word
  containing ё needs no acute (ё is inherently stressed).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import OrderedDict, defaultdict
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    except Exception:  # pragma: no cover
        pass


ROOT = Path(__file__).resolve().parent.parent        # russian/

ACUTE = "\u0301"           # combining acute accent
RU_VOWELS = "аеёиоуыэюя"
FREE_LETTERS = set("АКМОТЕ")            # CONTRACT 3: look-alike / sound-alike
NODE_ID_RE = re.compile(r"^s0\.")
CYRILLIC_RE = re.compile("[\u0400-\u04ff\u0500-\u052f]")
RU_TOKEN_RE = re.compile("[\u0400-\u04ff\u0500-\u052fA-Za-z\u0301]+")
LATIN_RE = re.compile(r"[A-Za-z]")

VALID_MODALITY = ("typed", "spoken", "either", "choice")
VALID_DIMENSION = ("recognition", "meaning", "controlled", "spontaneous")

# CONTRACT 3, the authorised readable word pool for Session Zero.
WORD_POOL = [
    "НОС", "СОН", "СОК", "КОТ", "ТОРТ", "МОСТ", "МОРС", "КАРТА", "КАССА",
    "МЕТРО", "МАМА", "РОК", "КРОТ", "СМЕТАНА", "ТОМАТ", "РАКЕТА", "КОМЕТА",
    "АРОМАТ",
]

# --- rule 1 key classification ---------------------------------------------
# Keys whose contents are never decodable: ids, machine fields, English, and
# the *heard* Russian (spoken lines and voiced prompts).
ALWAYS_EXCLUDE = {
    "id", "type", "audio", "who", "sprite", "bg", "stop", "teaches", "reviews",
    "tags", "dimension", "modality", "kind", "graded", "image", "translit",
    "en", "enAfter", "gloss", "hint", "intro", "trap", "bridge", "sound",
    "looksLike", "contrastWith", "upper", "lower", "letters", "variants",
    "prompt", "checks", "page", "note", "comment", "credit", "source",
    "covers", "correct", "pos", "gender", "forms", "lemma", "memory", "flags",
    "decodable",
    # `accept` members are typed by the learner and never painted on screen,
    # so they are production targets rather than something to decode
    # (CONTRACT 4 rule 1).  Rule 5 still checks that the set is sane.
    "accept",
}
# Heard-not-read Russian: excluded at node level, allowed once we are already
# inside a decodable container (e.g. words:[{ru:"нос", en:"nose"}]).
SPOKEN_FIELDS = {"ru", "stressed", "text", "line"}
# Containers whose Russian strings the learner reads off the screen.
DECODABLE_KEYS = {
    "words", "examples", "drill", "drills", "read", "reading",
    "practice", "pool", "wordPool", "sign", "lines", "tiles", "bank",
    "targets", "syllables",
}

ENGLISH_FIELDS = ("en", "enAfter", "intro", "trap", "bridge", "gloss", "title",
                  "label", "instructions", "help", "explain", "hint")


# ---------------------------------------------------------------------------
# Tolerant reader for the JS data files (kept in step with gen_audio.py)
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
    def __init__(self, text, origin="<js>"):
        self.s = text
        self.i = 0
        self.n = len(text)
        self.origin = origin

    def err(self, msg):
        line = self.s.count("\n", 0, self.i) + 1
        col = self.i - (self.s.rfind("\n", 0, self.i) + 1) + 1
        raise JsParseError("%s:%d:%d: %s" % (self.origin, line, col, msg))

    def ws(self):
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
                    pass
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
            if "x" in raw.lower():
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
        self.i += 1
        out = OrderedDict()
        while True:
            self.ws()
            if self.i >= self.n:
                self.err("unterminated object literal")
            c = self.s[self.i]
            if c == "}":
                self.i += 1
                return out
            if c == ",":
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
        self.i += 1
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
            container = found.setdefault(name, OrderedDict())
            for key in path[:-1]:
                if not isinstance(container, dict):
                    break
                container = container.setdefault(key, OrderedDict())
            if isinstance(container, dict):
                container[path[-1]] = value
    return found


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def has_cyrillic(s):
    return bool(CYRILLIC_RE.search(s or ""))


def strip_acute(s):
    return (s or "").replace(ACUTE, "")


def normalise(s):
    """Mirror of RU.grade.normalise (CONTRACT 2, grade.js).

    lowercase, trim, collapse spaces, strip punctuation, ё→е, strip U+0301.
    Rule 5 compares accept members through this, because two members that
    normalise the same are indistinguishable to the grader at runtime.
    """
    s = strip_acute(s or "").lower().replace("ё", "е")
    s = re.sub(r"[^\w\s]", " ", s, flags=re.UNICODE)
    s = re.sub(r"_", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def russian_words(text):
    """Cyrillic (or Cyrillic+Latin, for the homoglyph check) tokens."""
    return [t for t in RU_TOKEN_RE.findall(text or "") if has_cyrillic(t)]


def count_vowels(word):
    return sum(1 for ch in strip_acute(word).lower() if ch in RU_VOWELS)


def short(text, width=46):
    text = " ".join((text or "").split())
    return text if len(text) <= width else text[:width - 1] + "…"


class NodeRef(object):
    """One addressable node: a top-level node, a variant, or a variant's node."""

    __slots__ = ("index", "node", "path", "kind", "parent")

    def __init__(self, index, node, path, kind, parent):
        self.index = index      # position in the top-level array (ordering key)
        self.node = node
        self.path = path
        self.kind = kind        # "node" | "variant"
        self.parent = parent

    @property
    def id(self):
        nid = self.node.get("id")
        return nid if isinstance(nid, str) else None

    @property
    def label(self):
        return self.id or self.path


def find_nodes(session):
    """Locate the ordered node array.

    CONTRACT 1.3 says "a session is an ordered array of nodes" but 1.2 puts
    the letter registry on RU.SESSION0.letters, so SESSION0 is in practice an
    object.  It never names the key holding the array, so try the plausible
    names and then fall back to "the first array of typed objects".
    """
    if isinstance(session, list):
        return session, "SESSION0"
    if isinstance(session, dict):
        for key in ("nodes", "script", "session", "beats", "content", "arc", "scenes"):
            value = session.get(key)
            if isinstance(value, list) and any(isinstance(x, dict) and "type" in x for x in value):
                return value, "SESSION0." + key
        for key, value in session.items():
            if key == "letters":
                continue
            if (isinstance(value, list) and value
                    and all(isinstance(x, dict) for x in value)
                    and any("type" in x for x in value)):
                return value, "SESSION0." + key
    return [], "SESSION0"


def find_letter_registry(session):
    registry = OrderedDict()
    entries = session.get("letters") if isinstance(session, dict) else None
    if isinstance(entries, list):
        for item in entries:
            if isinstance(item, dict) and isinstance(item.get("id"), str):
                registry[item["id"]] = item
    return registry


def build_node_refs(nodes):
    refs = []
    for i, node in enumerate(nodes):
        if not isinstance(node, dict):
            continue
        refs.append(NodeRef(i, node, "nodes[%d]" % i, "node", None))
        if node.get("type") == "retrieval":
            variants = node.get("variants")
            if isinstance(variants, list):
                for j, variant in enumerate(variants):
                    if not isinstance(variant, dict):
                        continue
                    vpath = "nodes[%d].variants[%d]" % (i, j)
                    refs.append(NodeRef(i, variant, vpath, "variant", node.get("id")))
                    sub_nodes = variant.get("nodes")
                    if isinstance(sub_nodes, list):
                        for k, sub in enumerate(sub_nodes):
                            if isinstance(sub, dict):
                                refs.append(NodeRef(i, sub, "%s.nodes[%d]" % (vpath, k),
                                                    "node", variant.get("id")))
    return refs


def letter_char(entry_or_id, registry):
    """Uppercase Cyrillic letter for a `ltr:X` id or an inline letter object."""
    if isinstance(entry_or_id, dict):
        entry = entry_or_id
    else:
        entry = registry.get(entry_or_id)
    if isinstance(entry, dict):
        for field in ("upper", "lower"):
            value = entry.get(field)
            if isinstance(value, str) and value.strip():
                return value.strip()[0].upper()
    if isinstance(entry_or_id, str) and ":" in entry_or_id:
        tail = entry_or_id.split(":", 1)[1].strip()
        if tail:
            return tail[0].upper()
    if isinstance(entry_or_id, str) and entry_or_id.strip():
        return entry_or_id.strip()[0].upper()
    return None


def walk(obj, path, fn):
    """Depth-first walk calling fn(key, value, path) for every dict entry."""
    if isinstance(obj, dict):
        for key, value in obj.items():
            child = "%s.%s" % (path, key)
            fn(key, value, child)
            walk(value, child, fn)
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            walk(item, "%s[%d]" % (path, i), fn)


# ---------------------------------------------------------------------------
# Lint context
# ---------------------------------------------------------------------------

class Ctx(object):
    def __init__(self, args):
        self.args = args
        self.root = Path(args.root).resolve()
        self.session_path = Path(args.session) if args.session else self.root / "data" / "session0.js"
        self.lexicon_path = Path(args.lexicon) if args.lexicon else self.root / "data" / "lexicon.js"
        self.manifest_path = (Path(args.manifest) if args.manifest
                              else self.root / "audio" / "s0" / "manifest.json")
        self.warnings = []
        self.session = {}
        self.lexicon = {}
        self.manifest = None
        self.manifest_error = None
        self.nodes = []
        self.nodes_key = "SESSION0"
        self.refs = []
        self.registry = OrderedDict()
        self.load()

    def load(self):
        if not self.session_path.exists():
            raise SystemExit("lint: %s not found" % self.session_path)
        text = self.session_path.read_text(encoding="utf-8-sig")
        globs = parse_ru_globals(text, str(self.session_path), {"SESSION0"})
        if "SESSION0" not in globs:
            raise SystemExit("lint: no `RU.SESSION0 = ...` assignment in %s" % self.session_path)
        self.session = globs["SESSION0"]
        self.nodes, self.nodes_key = find_nodes(self.session)
        if not self.nodes:
            self.warnings.append("no node array found in %s" % self.session_path)
        self.refs = build_node_refs(self.nodes)
        self.registry = find_letter_registry(self.session)

        if self.lexicon_path.exists():
            ltext = self.lexicon_path.read_text(encoding="utf-8-sig")
            lglobs = parse_ru_globals(ltext, str(self.lexicon_path), {"LEXICON"})
            self.lexicon = lglobs.get("LEXICON") or {}
            if not self.lexicon:
                self.warnings.append("no `RU.LEXICON = ...` assignment in %s" % self.lexicon_path)
        else:
            self.warnings.append("lexicon not found: %s" % self.lexicon_path)

        if self.args.skip_audio:
            self.manifest = {}
        elif self.manifest_path.exists():
            try:
                self.manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))
            except Exception as exc:
                self.manifest_error = "unreadable manifest: %s" % exc
        else:
            self.manifest_error = "not found (run tools/gen_audio.py)"

    # -- shared derivations ------------------------------------------------
    def taught_at(self):
        """index in the top-level array -> uppercase letters taught there."""
        taught = defaultdict(set)
        for ref in self.refs:
            if ref.node.get("type") != "letters":
                continue
            entries = ref.node.get("letters")
            if not isinstance(entries, list):
                continue
            for entry in entries:
                ch = letter_char(entry, self.registry)
                if ch:
                    taught[ref.index].add(ch)
        return taught

    def allowed_letters(self, index, inclusive, taught=None):
        """Free set + letters taught before `index` (and at it, if inclusive).

        `inclusive` exists for one case only: a `letters` node may drill the
        letters it is itself introducing.  Everything else sees strictly
        earlier nodes, which is what CONTRACT rule 1 asks for.
        """
        taught = self.taught_at() if taught is None else taught
        allowed = set(FREE_LETTERS)
        for i, letters in taught.items():
            if i < index or (inclusive and i == index):
                allowed |= letters
        return allowed

    def exercises(self):
        """(NodeRef, exercise dict, label) for every exercise-shaped object."""
        out = []
        for ref in self.refs:
            node = ref.node
            if node.get("type") == "exercise":
                out.append((ref, node, ref.label))
            elif node.get("type") == "weblab":
                task = node.get("task")
                if isinstance(task, dict):
                    question = task.get("question")
                    if isinstance(question, dict) and ("kind" in question or "choices" in question
                                                       or "accept" in question):
                        out.append((ref, question, "%s.task.question" % ref.label))
        return out

    def audio_refs(self):
        """clip key -> [where it is referenced]."""
        found = defaultdict(list)

        def visit(key, value, path):
            if key == "audio" and isinstance(value, str) and value.strip():
                found[value.strip()].append(path)

        walk(self.session, "SESSION0", visit)
        return found


def V(rule, name, where, message, **extra):
    item = {"rule": rule, "name": name, "where": where, "message": message}
    item.update(extra)
    return item


# ---------------------------------------------------------------------------
# Rule 1 — letters
# ---------------------------------------------------------------------------

def collect_decodable(obj, path, out, inside=False):
    """Gather (path, string) pairs the learner reads rather than hears.

    `inside` becomes true once we descend through a decodable container, which
    is what lets words:[{ru:"нос"}] count while a line's own `ru` does not.
    """
    if isinstance(obj, str):
        if inside and has_cyrillic(obj):
            out.append((path, obj))
        return
    if isinstance(obj, list):
        for i, item in enumerate(obj):
            collect_decodable(item, "%s[%d]" % (path, i), out, inside)
        return
    if not isinstance(obj, dict):
        return
    for key, value in obj.items():
        if key == "choices":
            # Choices are read off the screen; only their Russian faces count.
            if isinstance(value, list):
                for i, choice in enumerate(value):
                    if not isinstance(choice, dict):
                        if isinstance(choice, str) and has_cyrillic(choice):
                            out.append(("%s.choices[%d]" % (path, i), choice))
                        continue
                    for field in ("ru", "word", "text", "stressed"):
                        got = choice.get(field)
                        if isinstance(got, str) and has_cyrillic(got):
                            out.append(("%s.choices[%d].%s" % (path, i, field), got))
                            break
            continue
        if key in ALWAYS_EXCLUDE and key not in DECODABLE_KEYS:
            continue
        if key in SPOKEN_FIELDS and not inside:
            continue
        collect_decodable(value, "%s.%s" % (path, key), out,
                          inside or key in DECODABLE_KEYS)


# Elements the page itself marks as unreadable decoration.  cafe.html documents
# the attribute and CONTRACT 4 rule 1 makes it contract: text the learner is
# meant to skip past is not text the learner is asked to decode.  Matched
# non-greedily up to the first matching close tag, which is all a flat prop page
# ever needs; nesting the same tag inside a noise element would defeat it, so
# do not nest.
_RU_NOISE_RE = re.compile(
    r"(?is)<([a-z][a-z0-9]*)\b[^>]*\bdata-ru-noise\s*=\s*[\"']?true[\"']?[^>]*>.*?</\1\s*>")


def _weblab_text(html):
    html = _RU_NOISE_RE.sub(" ", html)
    body = re.sub(r"(?is)<(script|style)\b.*?</\1\s*>", " ", html)
    body = re.sub(r"(?s)<!--.*?-->", " ", body)
    body = re.sub(r"(?s)<[^>]+>", " ", body)
    for entity, char in (("&nbsp;", " "), ("&amp;", "&"), ("&lt;", "<"),
                         ("&gt;", ">"), ("&quot;", '"'), ("&#39;", "'")):
        body = body.replace(entity, char)
    return body


def check_rule1_letters(ctx):
    """Every learner-decodable Russian word uses only free + earlier-taught letters."""
    violations = []
    taught = ctx.taught_at()
    known_ids = set(ctx.registry)

    for ref in ctx.refs:
        entries = ref.node.get("letters")
        if ref.node.get("type") == "letters" and isinstance(entries, list):
            for entry in entries:
                if isinstance(entry, str) and known_ids and entry not in known_ids:
                    violations.append(V(1, "letters", ref.label,
                                        "letters node references unknown letter id %r" % entry))

    def check_string(where, text, allowed, index):
        for token in RU_TOKEN_RE.findall(text):
            if not has_cyrillic(token):
                continue
            if LATIN_RE.search(token):
                # A Latin с/o/p hiding inside a Cyrillic word is undecodable
                # and invisible on screen; catch it here or never.
                violations.append(V(1, "letters", where,
                                    "mixed Latin and Cyrillic in %r "
                                    "(homoglyph typo?)" % token))
                continue
            bad = sorted({ch.upper() for ch in strip_acute(token)
                          if ch.upper() not in allowed and ch.isalpha()})
            if bad:
                violations.append(V(
                    1, "letters", where,
                    "%r uses %s, not taught before node %d (allowed: %s)"
                    % (token, " ".join(bad), index, " ".join(sorted(allowed)))))

    for ref in ctx.refs:
        # CONTRACT 4 rule 1's authored opt-out: a node that is not a decoding
        # check says so, and this rule leaves it alone.  s0.ex1 is the case it
        # exists for - the Latin-P trap has to be sprung before Р is taught.
        if ref.node.get("decodable") is False:
            continue
        # A letters node may drill the letters it is introducing; every other
        # node sees only what earlier nodes taught (CONTRACT 4.1).
        inclusive = ref.node.get("type") == "letters"
        allowed = ctx.allowed_letters(ref.index, inclusive, taught)

        strings = []
        collect_decodable(ref.node, ref.label, strings, False)
        # `image` is normally an emoji and is skipped with the other machine
        # fields, but CONTRACT 1.3 allows it to hold the written word being
        # decoded (s0.ex1 holds "РОК"), and a written word on screen is
        # exactly what rule 1 governs.  Checked here rather than in
        # collect_decodable so the emoji case costs nothing.
        image = ref.node.get("image")
        if isinstance(image, str) and has_cyrillic(image):
            strings.append(("%s.image" % ref.label, image))
        for where, text in strings:
            check_string(where, text, allowed, ref.index)

        if ref.node.get("type") == "weblab":
            page = ref.node.get("page")
            if isinstance(page, str) and page.strip():
                page_path = (ctx.root / page).resolve()
                if not page_path.exists():
                    ctx.warnings.append(
                        "%s: weblab page %s not found, its Russian was not checked"
                        % (ref.label, page))
                else:
                    text = _weblab_text(page_path.read_text(encoding="utf-8", errors="replace"))
                    for token in set(russian_words(text)):
                        check_string("%s (%s)" % (ref.label, page), token, allowed, ref.index)
    return violations


# ---------------------------------------------------------------------------
# Rule 2 — audio
# ---------------------------------------------------------------------------

def check_rule2_audio(ctx):
    """Every node with `audio` has a manifest entry; every entry is referenced."""
    violations = []
    referenced = ctx.audio_refs()
    if ctx.manifest_error:
        violations.append(V(2, "audio", str(ctx.manifest_path),
                            "manifest %s (%d clip key(s) referenced by the content)"
                            % (ctx.manifest_error, len(referenced))))
        return violations
    if ctx.args.skip_audio:
        return violations

    clips = ctx.manifest.get("clips") if isinstance(ctx.manifest, dict) else None
    if not isinstance(clips, dict):
        violations.append(V(2, "audio", str(ctx.manifest_path),
                            "manifest has no `clips` object"))
        return violations

    for key in sorted(referenced):
        if key not in clips:
            violations.append(V(2, "audio", referenced[key][0],
                                "audio %r has no manifest entry" % key))
            continue
        entry = clips[key]
        if not isinstance(entry, dict):
            violations.append(V(2, "audio", key, "manifest entry is not an object"))
            continue
        for field in ("file", "text", "dur", "words"):
            if field not in entry:
                violations.append(V(2, "audio", key,
                                    "manifest entry is missing %r" % field))
        for field in ("file", "slow"):
            name = entry.get(field)
            if isinstance(name, str) and name:
                if not (ctx.manifest_path.parent / name).exists():
                    violations.append(V(2, "audio", key,
                                        "manifest %s points at a missing file %s"
                                        % (field, name)))

    for key in sorted(clips):
        if key not in referenced:
            violations.append(V(2, "audio", key,
                                "manifest entry is never referenced by the content"))
    return violations


# ---------------------------------------------------------------------------
# Rule 3 — stress marks
# ---------------------------------------------------------------------------

def check_rule3_stress(ctx):
    """Exactly one U+0301 per polysyllabic Russian word in a `stressed` field."""
    violations = []
    targets = []

    def visit(key, value, path):
        if key == "stressed" and isinstance(value, str):
            targets.append((path, value))

    walk(ctx.session, "SESSION0", visit)
    for lex_id, lex in (ctx.lexicon or {}).items():
        if isinstance(lex, dict) and isinstance(lex.get("stressed"), str):
            targets.append(("LEXICON[%s].stressed" % lex_id, lex["stressed"]))

    for where, text in targets:
        if not text.strip():
            violations.append(V(3, "stress", where, "`stressed` is empty"))
            continue
        if not has_cyrillic(text):
            continue
        # An acute must sit immediately after a vowel or it will not render.
        for i, ch in enumerate(text):
            if ch == ACUTE:
                prev = text[i - 1] if i else ""
                if prev.lower() not in RU_VOWELS:
                    violations.append(V(3, "stress", where,
                                        "U+0301 after %r, which is not a vowel, in %r"
                                        % (prev, short(text))))
        for token in russian_words(text):
            if LATIN_RE.search(token):
                continue
            vowels = count_vowels(token)
            acutes = token.count(ACUTE)
            has_yo = "ё" in token.lower()
            if vowels >= 2:
                if acutes == 1:
                    continue
                if acutes == 0 and has_yo:
                    continue  # ё is inherently stressed and takes no acute
                violations.append(V(
                    3, "stress", where,
                    "%r has %d syllables and %d stress mark(s), expected exactly 1"
                    % (token, vowels, acutes)))
            elif acutes > 1:
                violations.append(V(3, "stress", where,
                                    "monosyllable %r carries %d stress marks"
                                    % (token, acutes)))
    return violations


# ---------------------------------------------------------------------------
# Rule 4 — graded exercises declare their metadata
# ---------------------------------------------------------------------------

def check_rule4_graded_metadata(ctx):
    """graded:true exercises declare modality, dimension and reviews."""
    violations = []
    for ref, ex, label in ctx.exercises():
        if ex.get("graded") is not True:
            continue
        modality = ex.get("modality")
        if not isinstance(modality, str) or not modality.strip():
            violations.append(V(4, "graded-metadata", label, "graded exercise has no `modality`"))
        elif modality not in VALID_MODALITY:
            violations.append(V(4, "graded-metadata", label,
                                "modality %r is not one of %s"
                                % (modality, "|".join(VALID_MODALITY))))
        dimension = ex.get("dimension")
        if not isinstance(dimension, str) or not dimension.strip():
            violations.append(V(4, "graded-metadata", label, "graded exercise has no `dimension`"))
        elif dimension not in VALID_DIMENSION:
            violations.append(V(4, "graded-metadata", label,
                                "dimension %r is not one of %s"
                                % (dimension, "|".join(VALID_DIMENSION))))
        reviews = ex.get("reviews")
        if not isinstance(reviews, list) or not reviews:
            violations.append(V(4, "graded-metadata", label,
                                "graded exercise has no non-empty `reviews`"))
        elif not all(isinstance(r, str) and r.strip() for r in reviews):
            violations.append(V(4, "graded-metadata", label,
                                "`reviews` must be a list of item ids"))
    return violations


# ---------------------------------------------------------------------------
# Rule 5 — constrained accept sets
# ---------------------------------------------------------------------------

def check_rule5_accept_sets(ctx):
    """constrained exercises have >=2 accept members, all distinct once normalised."""
    violations = []
    for ref, ex, label in ctx.exercises():
        if ex.get("kind") != "constrained":
            continue
        accept = ex.get("accept")
        if not isinstance(accept, list):
            violations.append(V(5, "accept-set", label,
                                "constrained exercise has no `accept` array"))
            continue
        if len(accept) < 2:
            violations.append(V(5, "accept-set", label,
                                "accept has %d member(s), CONTRACT requires >= 2"
                                % len(accept)))
        seen = {}
        for i, member in enumerate(accept):
            if not isinstance(member, str) or not member.strip():
                violations.append(V(5, "accept-set", label,
                                    "accept[%d] is not a non-empty string" % i))
                continue
            key = normalise(member)
            if not key:
                violations.append(V(5, "accept-set", label,
                                    "accept[%d] %r normalises to nothing" % (i, member)))
                continue
            if key in seen:
                violations.append(V(
                    5, "accept-set", label,
                    "accept[%d] %r and accept[%d] %r both normalise to %r - the "
                    "grader cannot tell them apart"
                    % (i, member, seen[key][0], seen[key][1], key)))
            else:
                seen[key] = (i, member)
    return violations


# ---------------------------------------------------------------------------
# Rule 6 — form checks resolve against the lexicon
# ---------------------------------------------------------------------------

def check_rule6_form_checks(ctx):
    """checks[].lex exists in the lexicon and the required form exists."""
    violations = []
    for ref, ex, label in ctx.exercises():
        checks = ex.get("checks")
        if checks is None:
            continue
        if not isinstance(checks, list):
            violations.append(V(6, "form-checks", label, "`checks` must be an array"))
            continue
        for i, check in enumerate(checks):
            where = "%s.checks[%d]" % (label, i)
            if not isinstance(check, dict):
                violations.append(V(6, "form-checks", where, "check is not an object"))
                continue
            lex_id = check.get("lex")
            if not isinstance(lex_id, str) or not lex_id.strip():
                violations.append(V(6, "form-checks", where, "check has no `lex`"))
                continue
            if not ctx.lexicon:
                violations.append(V(6, "form-checks", where,
                                    "cannot verify %r: the lexicon did not load" % lex_id))
                continue
            lex = ctx.lexicon.get(lex_id)
            if not isinstance(lex, dict):
                violations.append(V(6, "form-checks", where,
                                    "%r is not in RU.LEXICON" % lex_id))
                continue
            required = check.get("require")
            if required is None:
                continue
            wanted = required if isinstance(required, list) else [required]
            forms = lex.get("forms")
            if not isinstance(forms, dict):
                violations.append(V(6, "form-checks", where,
                                    "%r has no `forms` table to check %s against"
                                    % (lex_id, wanted)))
                continue
            for slot in wanted:
                if not isinstance(slot, str) or slot not in forms:
                    violations.append(V(6, "form-checks", where,
                                        "%r has no form %r (has: %s)"
                                        % (lex_id, slot, ", ".join(sorted(forms)) or "none")))
                elif not isinstance(forms[slot], str) or not forms[slot].strip():
                    violations.append(V(6, "form-checks", where,
                                        "%r form %r is empty" % (lex_id, slot)))
    return violations


# ---------------------------------------------------------------------------
# Rule 7 — open exercises are never graded
# ---------------------------------------------------------------------------

def check_rule7_open_ungraded(ctx):
    """Every `open` exercise has graded:false (PLAN_AUDIT 6.4)."""
    violations = []
    for ref, ex, label in ctx.exercises():
        if ex.get("kind") != "open":
            continue
        if ex.get("graded") is not False:
            violations.append(V(7, "open-ungraded", label,
                                "open exercise has graded=%r; open replies are practice, "
                                "never mastery evidence" % (ex.get("graded"),)))
        if isinstance(ex.get("accept"), list) and ex.get("accept"):
            violations.append(V(7, "open-ungraded", label,
                                "open exercise declares an `accept` set, which implies grading"))
    return violations


# ---------------------------------------------------------------------------
# Rule 8 — retrieval variants
# ---------------------------------------------------------------------------

def check_rule8_retrieval_variants(ctx):
    """>=2 variants, each with >=1 `covers`, and every variant line voiced."""
    violations = []
    for ref in ctx.refs:
        if ref.node.get("type") != "retrieval":
            continue
        label = ref.label
        variants = ref.node.get("variants")
        if not isinstance(variants, list):
            violations.append(V(8, "retrieval", label, "retrieval node has no `variants` array"))
            continue
        if len(variants) < 2:
            violations.append(V(8, "retrieval", label,
                                "retrieval node has %d variant(s), CONTRACT requires >= 2"
                                % len(variants)))
        for j, variant in enumerate(variants):
            vlabel = variant.get("id") if isinstance(variant, dict) else None
            vlabel = vlabel or "%s.variants[%d]" % (label, j)
            if not isinstance(variant, dict):
                violations.append(V(8, "retrieval", vlabel, "variant is not an object"))
                continue
            covers = variant.get("covers")
            if not isinstance(covers, list) or not covers:
                violations.append(V(8, "retrieval", vlabel,
                                    "variant has no non-empty `covers` - the selector "
                                    "cannot score it against due items"))
            sub_nodes = variant.get("nodes")
            if not isinstance(sub_nodes, list) or not sub_nodes:
                violations.append(V(8, "retrieval", vlabel, "variant has no `nodes`"))
                continue
            for k, sub in enumerate(sub_nodes):
                if not isinstance(sub, dict):
                    violations.append(V(8, "retrieval", vlabel,
                                        "nodes[%d] is not an object" % k))
                    continue
                if sub.get("type") != "line":
                    continue
                audio = sub.get("audio")
                if not isinstance(audio, str) or not audio.strip():
                    violations.append(V(
                        8, "retrieval", sub.get("id") or "%s.nodes[%d]" % (vlabel, k),
                        "variant line has no audio; a half-voiced variant must never "
                        "be selectable at runtime"))
    return violations


# ---------------------------------------------------------------------------
# Rule 9 — node ids
# ---------------------------------------------------------------------------

def check_rule9_ids(ctx):
    r"""Every node id is unique and matches ^s0\."""
    violations = []
    seen = {}
    for ref in ctx.refs:
        nid = ref.node.get("id")
        if not isinstance(nid, str) or not nid.strip():
            violations.append(V(9, "ids", ref.path,
                                "%s has no `id`" % ("variant" if ref.kind == "variant" else "node")))
            continue
        if not NODE_ID_RE.match(nid):
            violations.append(V(9, "ids", ref.path, "id %r does not match ^s0\\." % nid))
        if nid in seen:
            violations.append(V(9, "ids", ref.path,
                                "duplicate id %r (also at %s)" % (nid, seen[nid])))
        else:
            seen[nid] = ref.path
    return violations


# ---------------------------------------------------------------------------
# Rule 10 — English strings
# ---------------------------------------------------------------------------

def check_rule10_english(ctx):
    """No learner-facing English string is empty."""
    findings = []
    # (id(owner dict), field) pairs already reported by the specific checks
    # below, so the generic sweep does not report the same hole twice.
    covered = set()

    def require(owner, field, where, message):
        covered.add((id(owner), field))
        value = owner.get(field)
        if not (isinstance(value, str) and value.strip()):
            findings.append((where, message))

    # `en` is not merely non-empty, it must exist wherever the learner is shown
    # English: every line, every choice, every prompt, every web-lab task.
    for ref in ctx.refs:
        node = ref.node
        ntype = node.get("type")
        if ntype == "line":
            require(node, "en", ref.label, "line has no English `en`")
        prompt = node.get("prompt")
        if isinstance(prompt, dict):
            require(prompt, "en", ref.label + ".prompt", "prompt has no English `en`")
        choices = node.get("choices")
        if isinstance(choices, list):
            for i, choice in enumerate(choices):
                if isinstance(choice, dict):
                    # CONTRACT 4 rule 10: `en` is painted with the Russian,
                    # `enAfter` only once the answer is locked.  Either one
                    # satisfies the rule; neither does not.
                    covered.add((id(choice), "en"))
                    covered.add((id(choice), "enAfter"))
                    got = [f for f in ("en", "enAfter")
                           if isinstance(choice.get(f), str) and choice[f].strip()]
                    if not got:
                        findings.append(("%s.choices[%d]" % (ref.label, i),
                                         "choice has no English `en` or `enAfter`"))
                    elif len(got) == 2:
                        findings.append(("%s.choices[%d]" % (ref.label, i),
                                         "choice carries both `en` and `enAfter`; "
                                         "pick one, they render at different times"))
        if ntype == "weblab":
            task = node.get("task")
            if isinstance(task, dict):
                require(task, "en", ref.label + ".task", "web lab task has no English `en`")
            else:
                findings.append((ref.label + ".task", "web lab node has no `task`"))
        if ntype == "letters":
            require(node, "intro", ref.label, "letters node has no English `intro`")
    for entry_id, entry in (ctx.registry or {}).items():
        for field in ("trap", "sound"):
            require(entry, field, "letters[%s]" % entry_id,
                    "`%s` is missing or empty" % field)
    for lex_id, lex in (ctx.lexicon or {}).items():
        if isinstance(lex, dict):
            require(lex, "gloss", "LEXICON[%s]" % lex_id, "`gloss` is missing or empty")

    # Generic sweep for every other English field anywhere in the tree.
    def sweep(obj, path):
        if isinstance(obj, dict):
            for key, value in obj.items():
                child = "%s.%s" % (path, key)
                if (key in ENGLISH_FIELDS and isinstance(value, str)
                        and not value.strip() and (id(obj), key) not in covered):
                    findings.append((child, "%r is present but empty" % key))
                sweep(value, child)
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                sweep(item, "%s[%d]" % (path, i))

    sweep(ctx.session, "SESSION0")
    return [V(10, "english", where, message) for where, message in findings]


RULES = (
    (1, "letters", "learner-decodable words use only taught letters", check_rule1_letters),
    (2, "audio", "audio keys and manifest entries agree", check_rule2_audio),
    (3, "stress", "one U+0301 per polysyllabic stressed word", check_rule3_stress),
    (4, "graded-metadata", "graded exercises declare modality/dimension/reviews",
     check_rule4_graded_metadata),
    (5, "accept-set", "constrained accept sets are >=2 and distinct", check_rule5_accept_sets),
    (6, "form-checks", "checks resolve against the lexicon paradigms", check_rule6_form_checks),
    (7, "open-ungraded", "open exercises are never graded", check_rule7_open_ungraded),
    (8, "retrieval", "retrieval variants are complete, tagged and voiced",
     check_rule8_retrieval_variants),
    (9, "ids", "node ids are unique and namespaced s0.", check_rule9_ids),
    (10, "english", "no learner-facing English string is empty", check_rule10_english),
)


# ---------------------------------------------------------------------------
# Stats (PLAN_AUDIT 6.2 caps)
# ---------------------------------------------------------------------------

NEW_LEMMA_CAP = (6, 10)      # Arc 0-1 ceiling, PLAN_AUDIT 6.2


def build_stats(ctx):
    # Counted over the spine only: a variant's inner nodes are alternatives,
    # not extra beats, and counting them would inflate the session length.
    by_type = OrderedDict()
    for ref in ctx.refs:
        if ref.kind != "node" or ref.parent is not None:
            continue
        key = ref.node.get("type") or "?"
        by_type[key] = by_type.get(key, 0) + 1

    introduced = OrderedDict()
    for ref in ctx.refs:
        teaches = ref.node.get("teaches")
        if isinstance(teaches, list):
            for item in teaches:
                if isinstance(item, str) and item.strip() and item not in introduced:
                    introduced[item] = ref.label

    reviewed = OrderedDict()
    for ref in ctx.refs:
        for field in ("reviews", "covers"):
            items = ref.node.get(field)
            if isinstance(items, list):
                for item in items:
                    if isinstance(item, str) and item.strip():
                        reviewed.setdefault(item, []).append(ref.label)

    taught = ctx.taught_at()
    letters = []
    for index in sorted(taught):
        letters.extend(sorted(taught[index]))

    lemmas = [i for i in introduced if i.startswith("lex:")] or list(introduced)
    unknown = [i for i in introduced if ctx.lexicon and i.startswith("lex:")
               and i not in ctx.lexicon]
    dangling = [i for i in reviewed if i.startswith("lex:") and i not in introduced]

    # Same sources rule 1 checks, so the pool report and the letter check
    # never disagree about what the learner is asked to read.
    pool_used = set()
    for ref in ctx.refs:
        strings = []
        collect_decodable(ref.node, ref.label, strings, False)
        for _, text in strings:
            for token in russian_words(text):
                pool_used.add(strip_acute(token).upper())
        page = ref.node.get("page") if ref.node.get("type") == "weblab" else None
        if isinstance(page, str) and page.strip():
            page_path = (ctx.root / page).resolve()
            if page_path.exists():
                text = _weblab_text(page_path.read_text(encoding="utf-8", errors="replace"))
                for token in russian_words(text):
                    pool_used.add(strip_acute(token).upper())

    clips = 0
    if isinstance(ctx.manifest, dict):
        clips = len(ctx.manifest.get("clips") or {})

    cap_lo, cap_hi = NEW_LEMMA_CAP
    verdict = "ok"
    if len(lemmas) > cap_hi:
        verdict = "OVER CAP"
    elif len(lemmas) < cap_lo:
        verdict = "under the floor"

    return OrderedDict([
        ("nodesKey", ctx.nodes_key),
        ("nodeCount", len([r for r in ctx.refs if r.kind == "node" and r.parent is None])),
        ("nodesByType", by_type),
        ("variantCount", len([r for r in ctx.refs if r.kind == "variant"])),
        ("variantNodeCount", len([r for r in ctx.refs
                                  if r.kind == "node" and r.parent is not None])),
        ("lettersTaught", letters),
        ("newLemmas", list(lemmas)),
        ("newLemmaCount", len(lemmas)),
        ("newLemmaCap", list(NEW_LEMMA_CAP)),
        ("newLemmaVerdict", verdict),
        ("newItemCount", len(lemmas) + len(letters)),
        ("firstIntroducedAt", introduced),
        ("lemmasNotInLexicon", unknown),
        ("reviewedButNeverTaught", dangling),
        ("audioClips", clips),
        ("poolUsed", sorted(w for w in pool_used if w in WORD_POOL)),
        ("poolUnused", [w for w in WORD_POOL if w not in pool_used]),
        ("offPoolWords", sorted(w for w in pool_used if w not in WORD_POOL)),
    ])


def print_stats(stats):
    print("")
    print("STATS")
    print("  node array          %s (%d spine nodes, %d variants holding %d nodes)"
          % (stats["nodesKey"], stats["nodeCount"], stats["variantCount"],
             stats["variantNodeCount"]))
    print("  nodes by type       %s"
          % (", ".join("%s=%d" % kv for kv in stats["nodesByType"].items()) or "none"))
    print("  letters taught      %s" % (" ".join(stats["lettersTaught"]) or "none"))
    print("  new lemmas          %d  (Arc 0-1 cap %d-%d)  %s"
          % (stats["newLemmaCount"], stats["newLemmaCap"][0], stats["newLemmaCap"][1],
             stats["newLemmaVerdict"]))
    for item, where in stats["firstIntroducedAt"].items():
        print("                      %-22s first taught at %s" % (item, where))
    print("  new items total     %d  (lemmas + letters)" % stats["newItemCount"])
    print("  audio clips         %d" % stats["audioClips"])
    if stats["lemmasNotInLexicon"]:
        print("  NOT IN LEXICON      %s" % ", ".join(stats["lemmasNotInLexicon"]))
    if stats["reviewedButNeverTaught"]:
        print("  reviewed, untaught  %s" % ", ".join(stats["reviewedButNeverTaught"]))
    print("  word pool used      %s" % (" ".join(stats["poolUsed"]) or "none"))
    print("  word pool unused    %s" % (" ".join(stats["poolUnused"]) or "none"))
    if stats["offPoolWords"]:
        print("  outside the pool    %s" % " ".join(stats["offPoolWords"]))


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def parse_args(argv):
    p = argparse.ArgumentParser(description="Lint Session Zero content (CONTRACT.md section 4).")
    p.add_argument("--root", default=str(ROOT), help="the russian/ directory")
    p.add_argument("--session", default=None, help="override data/session0.js")
    p.add_argument("--lexicon", default=None, help="override data/lexicon.js")
    p.add_argument("--manifest", default=None, help="override audio/s0/manifest.json")
    p.add_argument("--json", action="store_true", help="machine-readable output")
    p.add_argument("--stats", action="store_true",
                   help="print curriculum numbers (PLAN_AUDIT 6.2 caps)")
    p.add_argument("--skip-audio", action="store_true",
                   help="skip rule 2 (use before gen_audio.py has ever run)")
    p.add_argument("--quiet", action="store_true", help="only print failures")
    return p.parse_args(argv)


def main(argv=None):
    args = parse_args(sys.argv[1:] if argv is None else argv)
    ctx = Ctx(args)

    results = OrderedDict()
    violations = []
    for number, name, description, fn in RULES:
        found = fn(ctx) or []
        results[number] = found
        violations.extend(found)

    stats = build_stats(ctx) if (args.stats or args.json) else None

    if args.json:
        payload = OrderedDict([
            ("ok", not violations),
            ("session", str(ctx.session_path)),
            ("violationCount", len(violations)),
            ("violations", violations),
            ("warnings", ctx.warnings),
            ("rules", OrderedDict(
                (str(number), {"name": name, "description": description,
                               "violations": len(results[number])})
                for number, name, description, _ in RULES)),
        ])
        if stats is not None:
            payload["stats"] = stats
        print(json.dumps(payload, ensure_ascii=False, indent=1))
        return 1 if violations else 0

    if not args.quiet:
        print("Session Zero lint")
        print("  session   %s" % ctx.session_path)
        print("  lexicon   %s%s" % (ctx.lexicon_path, "" if ctx.lexicon else "   (not loaded)"))
        print("  manifest  %s%s" % (ctx.manifest_path,
                                    "   (%s)" % ctx.manifest_error if ctx.manifest_error else ""))
        print("")
        for number, name, description, _ in RULES:
            count = len(results[number])
            print("  rule %2d  %-46s %s"
                  % (number, description, "ok" if not count else "%d violation(s)" % count))

    if violations:
        for number, name, description, _ in RULES:
            found = results[number]
            if not found:
                continue
            print("")
            print("RULE %d  %s  (%s)" % (number, description, name))
            for item in found:
                print("  %-34s %s" % (item["where"], item["message"]))

    if ctx.warnings and not args.quiet:
        print("")
        print("WARNINGS (not failures)")
        for warning in ctx.warnings:
            print("  %s" % warning)

    if stats is not None:
        print_stats(stats)

    if not args.quiet or violations:
        print("")
        failed_rules = len([n for n in results if results[n]])
        print("%s  %d violation(s) across %d of 10 rules"
              % ("FAIL" if violations else "PASS", len(violations), failed_rules))
    return 1 if violations else 0


if __name__ == "__main__":
    sys.exit(main())
