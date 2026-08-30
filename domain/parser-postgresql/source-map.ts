import type { SourcePosition, SourceSpan } from "../schema-ir";

export interface SourceMapper {
  readonly byteLength: number;
  positionAtUtf16(utf16Offset: number): SourcePosition;
  positionAtByte(byteOffset: number): SourcePosition;
  spanFromBytes(startByte: number, endByte: number): SourceSpan;
  spanFromUtf16(startOffset: number, endOffset: number): SourceSpan;
}

export function createSourceMapper(source: string): SourceMapper {
  const byteBoundaries: { byte: number; utf16: number }[] = [{ byte: 0, utf16: 0 }];
  let byte = 0;
  let utf16 = 0;

  for (const character of source) {
    byte += new TextEncoder().encode(character).length;
    utf16 += character.length;
    byteBoundaries.push({ byte, utf16 });
  }

  function utf16AtByte(rawByteOffset: number): number {
    const byteOffset = Math.max(0, Math.min(byte, rawByteOffset));
    let low = 0;
    let high = byteBoundaries.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const candidate = byteBoundaries[middle]!;
      if (candidate.byte === byteOffset) return candidate.utf16;
      if (candidate.byte < byteOffset) low = middle + 1;
      else high = middle - 1;
    }
    return byteBoundaries[Math.max(0, high)]!.utf16;
  }

  function positionAtUtf16(rawOffset: number): SourcePosition {
    const offset = Math.max(0, Math.min(source.length, rawOffset));
    let line = 1;
    let lineStart = 0;
    for (let index = 0; index < offset; index += 1) {
      if (source[index] === "\n") {
        line += 1;
        lineStart = index + 1;
      }
    }
    return { offset, line, column: offset - lineStart + 1 };
  }

  function positionAtByte(byteOffset: number): SourcePosition {
    return positionAtUtf16(utf16AtByte(byteOffset));
  }

  return {
    byteLength: byte,
    positionAtUtf16,
    positionAtByte,
    spanFromBytes(startByte, endByte) {
      const safeStart = Math.max(0, Math.min(byte, startByte));
      const safeEnd = Math.max(safeStart, Math.min(byte, endByte));
      return { start: positionAtByte(safeStart), end: positionAtByte(safeEnd) };
    },
    spanFromUtf16(startOffset, endOffset) {
      const safeStart = Math.max(0, Math.min(source.length, startOffset));
      const safeEnd = Math.max(safeStart, Math.min(source.length, endOffset));
      return {
        start: positionAtUtf16(safeStart),
        end: positionAtUtf16(safeEnd),
      };
    },
  };
}
