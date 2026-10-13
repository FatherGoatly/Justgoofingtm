import { describe, it, expect } from "vitest";
import { escapeHTML, renderInline, renderCodeBlock, slugify, highlightSyntax } from "../../scripts/utilities/html.js";

describe("html utilities", () => {
  it("escapes dangerous characters", () => {
    expect(escapeHTML(`<script>alert("x")</script>`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(escapeHTML(null)).toBe("");
  });
  it("renders inline markup without allowing raw HTML", () => {
    const html = renderInline("Use `const` and **never** <b>raw</b> [[Variable]] or [[lesson:t1-variables|that lesson]]");
    expect(html).toContain("<code>const</code>");
    expect(html).toContain("<strong>never</strong>");
    expect(html).toContain("&lt;b&gt;raw&lt;/b&gt;");
    expect(html).toContain('data-term="variable"');
    expect(html).toContain('data-lesson-id="t1-variables"');
  });
  it("renders a numbered code block with annotations and escaped content", () => {
    const html = renderCodeBlock(`const a = "<x>";\nconsole.log(a);`, { annotations: [{ line: 2, note: "prints it" }] });
    expect(html).toContain("&lt;x&gt;");
    expect(html).toContain('class="code-line annotated"');
    expect(html).toContain("prints it");
    expect(html.match(/line-number/g).length).toBe(2);
  });
  it("highlights keywords and strings", () => {
    const h = highlightSyntax(`const name = "Bob"; // hi`);
    expect(h).toContain('tok-keyword">const');
    expect(h).toContain('tok-string">&quot;Bob&quot;');
    expect(h).toContain("tok-comment");
  });
  it("slugifies", () => { expect(slugify("Hello World!")).toBe("hello-world"); });
});
