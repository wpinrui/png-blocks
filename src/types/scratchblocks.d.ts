declare module "scratchblocks" {
  type Doc = unknown;
  type View = {
    width: number;
    height: number;
    render(): SVGSVGElement;
    exportSVGString(): string;
  };
  const scratchblocks: {
    parse(code: string, options?: { languages?: string[] }): Doc;
    newView(doc: Doc, options: { style: string; scale?: number }): View;
  };
  export default scratchblocks;
}
