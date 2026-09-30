def find_const(text, name):
    """Return (start, end) span of `const NAME = <literal>;` using real bracket matching."""
    import re
    m = re.search(r'const\s+%s\s*=\s*' % re.escape(name), text)
    if not m:
        raise KeyError(name)
    i = m.end()
    if text[i] not in '[{':
        raise ValueError(f'{name}: expected [ or {{ at offset {i}, got {text[i]!r}')
    open_c, close_c = text[i], {'[': ']', '{': '}'}[text[i]]
    depth, j = 0, i
    in_str = None
    while j < len(text):
        c = text[j]
        if in_str:
            if c == '\\': j += 2; continue
            if c == in_str: in_str = None
        elif c in '\'"`':
            in_str = c
        elif c == open_c:
            depth += 1
        elif c == close_c:
            depth -= 1
            if depth == 0:
                j += 1
                while j < len(text) and text[j] in ' \n\t': j += 1
                if j < len(text) and text[j] == ';': j += 1
                return m.start(), j
        j += 1
    raise ValueError(f'{name}: unbalanced literal')

def swap_const(text, name, literal):
    a, b = find_const(text, name)
    return text[:a] + f'const {name} = ' + literal + ';' + text[b:]
