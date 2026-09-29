// lib/pdfMetni.ts'i gerçek pdf.js ile ayrı bir Node sürecinde çalıştırır (Jest pdf.js'in ES modülünü yükleyemiyor).
// Node TypeScript'i doğrudan çalıştırır; "@/..." yolları proje köküne çevrilir.
// Kullanım: node pdfMetniCalistir.mjs <pdf dosyası>... → her dosya için pdfMetni sonucu, JSON dizi olarak.
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const kok = new URL("../../", import.meta.url).href;
register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(s, c, n) { return n(s.startsWith("@/") ? ${JSON.stringify(kok)} + s.slice(2) + ".ts" : s, c); }`)
);
const { pdfMetni } = await import(new URL("lib/pdfMetni.ts", kok).href);
const sonuclar = [];
for (const yol of process.argv.slice(2)) sonuclar.push(await pdfMetni(new File([readFileSync(yol)], pathToFileURL(yol).pathname.split("/").pop())));
process.stdout.write(JSON.stringify(sonuclar));
