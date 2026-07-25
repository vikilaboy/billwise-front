import {readdirSync, readFileSync} from "node:fs";
import {join, relative} from "node:path";
import {describe, expect, it} from "vitest";

const sourceRoot = join(process.cwd(), "src");

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [path] : [];
  });
}

describe("HeroUI form controls policy", () => {
  it("nu permite selecturi, calendare, checkbox-uri, radio sau switch-uri native", () => {
    const forbidden = [
      {label: "select nativ", pattern: /<select\b/},
      {label: "input date nativ", pattern: /<input\b[^>]*\btype=["']date["']/},
      {label: "checkbox nativ", pattern: /<input\b[^>]*\btype=["']checkbox["']/},
      {label: "radio nativ", pattern: /<input\b[^>]*\btype=["']radio["']/},
      {label: "switch custom", pattern: /\brole=["']switch["']/},
    ];
    const violations = tsxFiles(sourceRoot)
      .filter((path) => !path.endsWith("formControlsPolicy.test.ts"))
      .flatMap((path) => {
        const source = readFileSync(path, "utf8");
        return forbidden
          .filter(({pattern}) => pattern.test(source))
          .map(({label}) => `${relative(sourceRoot, path)}: ${label}`);
      });

    expect(violations).toEqual([]);
  });
});
