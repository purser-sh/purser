declare module "gpt-tokenizer/encoding/o200k_base" {
  export function encode(text: string): number[];
}

declare module "gpt-tokenizer/model/gpt-4o" {
  const tokenizer: { encode: (text: string) => number[] };
  export default tokenizer;
}

declare module "gpt-tokenizer/model/o1" {
  const tokenizer: { encode: (text: string) => number[] };
  export default tokenizer;
}

declare module "gpt-tokenizer/model/o3-mini" {
  const tokenizer: { encode: (text: string) => number[] };
  export default tokenizer;
}
