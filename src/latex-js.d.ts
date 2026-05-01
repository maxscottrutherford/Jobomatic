declare module "latex.js" {
  export class HtmlGenerator {
    constructor(options?: { hyphenate?: boolean });
    stylesAndScripts(baseUrl: string): DocumentFragment;
    domFragment(): DocumentFragment;
  }
  export function parse(
    source: string,
    options: { generator: HtmlGenerator }
  ): unknown;
}
