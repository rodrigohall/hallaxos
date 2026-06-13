import { test } from "node:test";
import assert from "node:assert/strict";
import { sniffFormato } from "../services/documentos";

const comHeader = (bytes: number[], tamanho = 32): Buffer => {
  const b = Buffer.alloc(tamanho);
  bytes.forEach((v, i) => (b[i] = v));
  return b;
};

test("reconhece JPEG, PNG, PDF, GIF pelos magic bytes", () => {
  assert.equal(sniffFormato(comHeader([0xff, 0xd8, 0xff]))?.mime, "image/jpeg");
  assert.equal(sniffFormato(comHeader([0x89, 0x50, 0x4e, 0x47]))?.mime, "image/png");
  assert.equal(sniffFormato(comHeader([0x25, 0x50, 0x44, 0x46]))?.mime, "application/pdf");
  assert.equal(sniffFormato(comHeader([0x47, 0x49, 0x46, 0x38]))?.mime, "image/gif");
});

test("reconhece WEBP (RIFF....WEBP) e HEIC (ftyp)", () => {
  const webp = Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "ascii");
  assert.equal(sniffFormato(webp)?.mime, "image/webp");
  const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic", "ascii"), Buffer.alloc(8)]);
  assert.equal(sniffFormato(heic)?.mime, "image/heic");
});

test("recusa conteúdo desconhecido e buffers curtos", () => {
  assert.equal(sniffFormato(Buffer.from("texto qualquer aqui!", "ascii")), null);
  assert.equal(sniffFormato(Buffer.from([1, 2, 3])), null);
});
