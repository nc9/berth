// Dependency-free SVG sanitizer. SVG is active content, so this re-emits only
// what it understands: it parses the document into tokens, drops dangerous
// elements and attributes, and refuses (returns ok: false) anything it cannot
// parse with certainty. It never repairs malformed input.

export type SanitizeResult =
  { ok: true; svg: string } | { ok: false; reason: string };

const DROP_ELEMENTS = new Set(["script", "foreignobject"]);
const SAFE_HREF =
  /^(#[^\s"'<>]*|data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]*)$/i;
const NAME = /^[A-Za-z_][\w.-]*(:[A-Za-z_][\w.-]*)?$/;
const ATTR = /\s+([^\s=/>"']+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;

const local = (name: string) => name.slice(name.indexOf(":") + 1).toLowerCase();
const esc = (v: string) => v.replace(/"/g, "&quot;");

/** True when a value could load something external or run script. */
function unsafeValue(v: string): boolean {
  // Numeric entities can hide a scheme; drop rather than decode.
  if (/&#/.test(v)) return true;
  const s = v;
  if (/javascript:/i.test(s)) return true;
  for (const m of s.matchAll(/url\(\s*(['"]?)\s*([^)'"]*)/gi))
    if (!m[2]!.startsWith("#")) return true;
  return /@import/i.test(s);
}

export function sanitizeSvg(input: string): SanitizeResult {
  const fail = (reason: string): SanitizeResult => ({ ok: false, reason });
  const text = input.replace(/^﻿/, "");
  if (text.includes("\0")) return fail("NUL byte");
  let i = 0;
  let out = "";
  const stack: string[] = [];
  let skipDepth = 0; // > 0 while inside a dropped element
  let sawRoot = false;
  let rootClosed = false;

  while (i < text.length) {
    if (text[i] !== "<") {
      const end = text.indexOf("<", i);
      const chunk = text.slice(i, end === -1 ? text.length : end);
      if (stack.length === 0 && chunk.trim() !== "")
        return fail("text outside root element");
      if (skipDepth === 0) out += chunk;
      i = end === -1 ? text.length : end;
      continue;
    }
    if (text.startsWith("<!--", i)) {
      const end = text.indexOf("-->", i + 4);
      if (end === -1) return fail("unterminated comment");
      i = end + 3; // comments are dropped
      continue;
    }
    if (text.startsWith("<![CDATA[", i)) return fail("CDATA is not supported");
    if (text.startsWith("<!", i)) return fail("DOCTYPE/ENTITY is not allowed");
    if (text.startsWith("<?", i)) {
      const end = text.indexOf("?>", i);
      if (end === -1) return fail("unterminated processing instruction");
      const pi = text.slice(i, end + 2);
      if (!/^<\?xml\s[^<>]*\?>$/.test(pi) || sawRoot)
        return fail("processing instruction is not allowed");
      out += pi;
      i = end + 2;
      continue;
    }
    if (text.startsWith("</", i)) {
      const m = /^<\/([^\s>]+)\s*>/.exec(text.slice(i, i + 300));
      if (!m || !NAME.test(m[1]!)) return fail("malformed closing tag");
      if (stack.pop() !== m[1]) return fail("mismatched closing tag");
      if (skipDepth > 0) skipDepth--;
      else out += `</${m[1]}>`;
      if (stack.length === 0) rootClosed = true;
      i += m[0].length;
      continue;
    }
    // Start tag.
    const nm = /^<([^\s/>]+)/.exec(text.slice(i, i + 300));
    if (!nm || !NAME.test(nm[1]!)) return fail("malformed tag name");
    if (rootClosed) return fail("content after root element");
    const name = nm[1]!;
    let p = i + nm[0].length;
    const attrs: [string, string][] = [];
    for (;;) {
      ATTR.lastIndex = p;
      const am = ATTR.exec(text);
      if (!am) break;
      const v = am[2] ?? am[3] ?? "";
      if (v.includes("<")) return fail("'<' in attribute value");
      attrs.push([am[1]!, v]);
      p = ATTR.lastIndex;
    }
    const close = /^\s*(\/?)>/.exec(text.slice(p, p + 50));
    if (!close) return fail("malformed attributes");
    p += close[0].length;
    const selfClosing = close[1] === "/";
    if (!sawRoot) {
      if (local(name) !== "svg") return fail("root element is not svg");
      sawRoot = true;
    }
    const names = new Set<string>();
    for (const [a] of attrs) {
      if (names.has(a)) return fail("duplicate attribute");
      names.add(a);
    }
    const drop =
      skipDepth > 0 ||
      DROP_ELEMENTS.has(local(name)) ||
      // SMIL can rewrite href after load.
      (/^(set|animate)$/.test(local(name)) &&
        attrs.some(([a, v]) => a === "attributeName" && /href/i.test(v)));
    if (drop) {
      if (!selfClosing) {
        stack.push(name);
        skipDepth++;
      }
    } else {
      let tag = `<${name}`;
      for (const [a, v] of attrs) {
        const l = local(a);
        if (/^on/i.test(l)) continue;
        if (l === "href" && !SAFE_HREF.test(v.trim())) continue;
        if (
          a === "style" ||
          a === "src" ||
          /^(fill|stroke|filter|mask|clip-path)$/.test(l)
        ) {
          if (unsafeValue(v)) continue;
        } else if (unsafeValue(v) && l !== "href") continue;
        tag += ` ${a}="${esc(v)}"`;
      }
      tag += selfClosing ? "/>" : ">";
      out += tag;
      if (!selfClosing) stack.push(name);
      else if (stack.length === 0) rootClosed = true;
    }
    i = p;
  }
  if (!sawRoot) return fail("no root element");
  if (stack.length > 0) return fail("unclosed element");
  // <style> blocks can import or reference external resources.
  if (/<style[\s>]/i.test(out)) {
    const css = [...out.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];
    if (css.some((m) => unsafeValue(m[1]!)))
      return fail("style references external resources");
  }
  return { ok: true, svg: out };
}
