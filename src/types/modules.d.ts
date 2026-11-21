declare module 'mammoth/mammoth.browser.js' {
  interface ExtractResult {
    value: string;
    messages: { type: string; message: string }[];
  }
  const mammoth: {
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<ExtractResult>;
  };
  export default mammoth;
}
