import {readFileSync} from "node:fs";
import {resolve} from "node:path";
function statementAt(src, start, isFn) {
  // scan one top-level declaration: skips strings, template literals (with ${} nesting) and comments
  let depth = 0, i = start, seenBody = false; const tpl = [];
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (tpl.length && tpl[tpl.length - 1] === "t") {            // inside a template literal
      if (c === "\\") { i += 2; continue; }
      if (c === "`") { tpl.pop(); i++; continue; }
      if (c === "$" && d === "{") { tpl.push(depth); depth++; i += 2; continue; }
      i++; continue;
    }
    if (c === "/" && d === "/") { i = src.indexOf("\n", i); continue; }
    if (c === "/" && d === "*") { i = src.indexOf("*/", i) + 2; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (src[j] !== c) j += src[j] === "\\" ? 2 : 1; i = j + 1; continue; }
    if (c === "`") { tpl.push("t"); i++; continue; }
    if (c === "(" || c === "[" || c === "{") { if (c === "{" && depth === 0) seenBody = true; depth++; i++; continue; }
    if (c === ")" || c === "]" || c === "}") {
      depth--; i++;
      if (c === "}" && tpl.length && tpl[tpl.length - 1] === depth) { tpl.pop(); continue; }   // back into the enclosing template
      if (isFn && seenBody && depth === 0) return src.slice(start, i);
      continue;
    }
    if (!isFn && c === ";" && depth === 0) return src.slice(start, i + 1);
    i++;
  }
  throw new Error("unterminated declaration at " + start);
}

export function loadIndicators(root) {
  const src=readFileSync(resolve(root,"btc.html"),"utf8").replace(/\r\n/g,"\n");
  const names=["iEMA","iSMMA","iZLEMA","iSMAv","impulseMACD","smaN","ensGroup","ensSpread"];
  const parts=names.map(n=>{const start=src.indexOf("function "+n+"(");if(start<0)throw Error("Missing indicator "+n);return statementAt(src,start,true);});
  return new Function(parts.join("\n")+"\nreturn {"+names.join(",")+"};")();
}
