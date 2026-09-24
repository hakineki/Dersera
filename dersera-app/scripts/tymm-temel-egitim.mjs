// TYMM temel eğitim öğretim programlarını (ilkokul 1–4, ortaokul 5–8) tymm.meb.gov.tr'den çeker ve
// data/mufredat/tymm-<kademe>.json'a yazar. Metinler sayfalardan birebir alınır; uydurma/özetleme yoktur.
// Yeniden çalıştırılabilir:
//
//   node scripts/tymm-temel-egitim.mjs            (iki kademe)
//   node scripts/tymm-temel-egitim.mjs ilkokul    (yalnız biri)
//
// Kaynak yapısı: /Ders/GetDerslerBySinif (dersler), /Unite/GetUnitelerByDersId (üniteler), /<ders-url>/unite/<id>
// (ünite sayfası). Ünite alanları lise verisiyle (tymm-programlar.json) aynıdır: id, ad, amac, konular, ogrenmeCiktilari.
// konular: "İçerik Çerçevesi" bölümündeki maddeler; madde yoksa bölümdeki satırlar. Bazı ünite sayfalarında (ör. 5. ve
// 8. sınıf Türkçe) bu bölüm yoktur; konular boş kalır (lise verisinde de 57 ünitede boştur), istem "belirtilmemiş" yazar.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const KOK = "https://tymm.meb.gov.tr";
// Sitenin sınıf kimlikleri (temel eğitim kademesi = 2).
const SINIF_ID = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9 };
// Oyun üretimine uygun akademik dersler (lise verisindeki seçimle aynı ölçüt). dersId sitenin ders kimliğidir;
// ilkokul ve ortaokul Türkçe/Matematik sitede ayrı derslerdir, uygulamada aynı ders anahtarını paylaşır.
const KADEMELER = {
  ilkokul: {
    ad: "ilkokul, 1–4. sınıf",
    dersler: [
      { key: "turkce", dersId: 1, siniflar: [1, 2, 3, 4] },
      { key: "matematik", dersId: 2, siniflar: [1, 2, 3, 4] },
      { key: "hayat-bilgisi", dersId: 4, siniflar: [1, 2, 3] },
      { key: "fen-bilimleri", dersId: 3, siniflar: [3, 4] },
      { key: "sosyal-bilgiler", dersId: 8, siniflar: [4] },
      { key: "din-kulturu", dersId: 10, siniflar: [4] },
    ],
  },
  ortaokul: {
    ad: "ortaokul, 5–8. sınıf",
    dersler: [
      { key: "matematik", dersId: 7, siniflar: [5, 6, 7, 8] },
      { key: "fen-bilimleri", dersId: 3, siniflar: [5, 6, 7, 8] },
      { key: "turkce", dersId: 6, siniflar: [5, 6, 7, 8] },
      { key: "sosyal-bilgiler", dersId: 8, siniflar: [5, 6, 7] },
      { key: "inkilap-tarihi", dersId: 9, siniflar: [8] },
      { key: "din-kulturu", dersId: 10, siniflar: [5, 6, 7, 8] },
    ],
  },
};
const BEKLE_MS = 300;

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

async function al(yol, tur = "json") {
  for (let deneme = 1; ; deneme++) {
    try {
      const res = await fetch(KOK + yol);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return tur === "json" ? await res.json() : await res.text();
    } catch (err) {
      if (deneme >= 3) throw new Error(`${yol}: ${err.message}`);
      await bekle(1000 * deneme);
    }
  }
}

const VARLIK = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", ndash: "–", mdash: "—" };
const coz = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, ad) => VARLIK[ad.toLowerCase()] ?? m);
const duz = (html) => coz(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// Başlığı verilen bölümün içerik HTML'i (iç içe div'ler sayılarak).
function bolum(html, baslik) {
  const re = new RegExp(`class="col-md-3 bg-light p-2 title">\\s*${baslik.replace(/[()]/g, "\\$&")}\\s*</div>\\s*<div class="col-md-9 p-2 content">`);
  const m = re.exec(html);
  if (!m) return null;
  let i = m.index + m[0].length;
  const bas = i;
  for (let derinlik = 1; derinlik > 0 && i < html.length; ) {
    const ac = html.indexOf("<div", i);
    const kapa = html.indexOf("</div>", i);
    if (kapa < 0) break;
    if (ac >= 0 && ac < kapa) {
      derinlik++;
      i = ac + 4;
    } else {
      derinlik--;
      i = kapa + 6;
    }
  }
  return html.slice(bas, i - 6);
}

// Bölüm HTML'ini satırlara böler (paragraf, madde, satır sonu).
const satirlar = (h) =>
  h
    .split(/<\/?(?:p|li|br|ul|ol|div)[^>]*>/i)
    .map(duz)
    .map((s) => s.replace(/^[•·\-–]\s*/, "").trim())
    .filter(Boolean);

// Kod: "FB.5.2.1." (ders.sınıf.ünite.sıra) ya da Türkçe'de "T.D.5.3." (ders.beceri.sınıf.sıra). Bazı sayfalarda
// koddan sonra boşluk yoktur ("SB.6.3.1.Türkistan’da ...") ya da önekten sonra boşluk vardır ("MAT. 1.3.3.");
// kod boşluksuz resmî biçimde ("MAT.1.3.3") saklanır.
const KOD = /^([A-ZÇĞİÖŞÜ]{1,6}(?:\.[A-ZÇĞİÖŞÜ]{1,6})?\.\s?(\d+)(?:\.\d+){1,2})(?:\.?:?\s+|\.(?=\p{L}))(.+)$/u;
// Kod gibi başlayan her satır (kısmi kayıp denetimi: ayrıştırılamayan kod satırı uyarılır).
const KOD_GIBI = /^[A-ZÇĞİÖŞÜ]{1,6}(?:\.[A-ZÇĞİÖŞÜ]{1,6})?\.\s?\d+\.\d+/u;

function uniteAyristir(html, sinif) {
  const intro = /<div class="unite-detail__intro text">([\s\S]*?)<\/div>/.exec(html);
  const cikti = bolum(html, "Öğrenme Çıktıları ve Süreç Bileşenleri") ?? "";
  const ogrenmeCiktilari = [];
  const atlanan = [];
  for (const s of satirlar(cikti)) {
    const m = KOD.exec(s);
    if (m && Number(m[2]) === sinif) ogrenmeCiktilari.push({ kod: m[1].replace(/\s+/g, ""), metin: m[3].trim() });
    else if (KOD_GIBI.test(s)) atlanan.push(s.slice(0, 60));
  }
  const icerik = bolum(html, "İçerik Çerçevesi") ?? "";
  const maddeler = [...icerik.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => duz(m[1])).filter(Boolean);
  return {
    amac: intro ? duz(intro[1]) || null : null,
    konular: maddeler.length ? maddeler : satirlar(icerik),
    ogrenmeCiktilari,
    atlanan,
  };
}

async function kademeCek(kademe, { ad, dersler }) {
const uyarilar = [];
const programlar = {};
let toplamUnite = 0;
for (const ders of dersler) {
  programlar[ders.key] = {};
  for (const sinif of ders.siniflar) {
    const uniteler = await al(`/Unite/GetUnitelerByDersId?dersId=${ders.dersId}&sinifId=${SINIF_ID[sinif]}`);
    const liste = [];
    for (const u of uniteler) {
      await bekle(BEKLE_MS);
      const html = await al(`/${u.url}/unite/${u.id}`, "text");
      const { atlanan, ...a } = uniteAyristir(html, sinif);
      for (const s of atlanan) uyarilar.push(`${ders.key} ${sinif}. sınıf (${u.id}): ayrıştırılamayan kod satırı: ${s}`);
      const ad = u.title.replace(/^\d+\.\s*(?:Ünite|Tema|Öğrenme Alanı)\s*:\s*/i, "").trim();
      if (!a.ogrenmeCiktilari.length) uyarilar.push(`${ders.key} ${sinif}. sınıf "${ad}" (${u.id}): öğrenme çıktısı bulunamadı`);
      liste.push({ id: String(u.id), ad, ...a });
      toplamUnite++;
      process.stdout.write(".");
    }
    programlar[ders.key][String(sinif)] = liste;
  }
}

// Kod tekilliği: aynı kod iki ünitede olmamalı. Türkçe beceri temellidir; aynı beceri kodu birden çok temada
// çalışılır (lise Türk Dili verisinde de böyledir), yalnız aynı ünitede tekrar uyarılır.
const gorulen = new Map();
for (const [ders, siniflar] of Object.entries(programlar))
  for (const [sinif, uniteler] of Object.entries(siniflar))
    for (const u of uniteler)
      for (const c of u.ogrenmeCiktilari) {
        const yer = `${ders} ${sinif} ${u.id}`;
        const onceki = gorulen.get(c.kod);
        if (onceki && (ders !== "turkce" || onceki === yer)) uyarilar.push(`${c.kod} iki kez: ${onceki} ve ${yer}`);
        gorulen.set(c.kod, yer);
      }

const CIKTI = fileURLToPath(new URL(`../data/mufredat/tymm-${kademe}.json`, import.meta.url));
writeFileSync(
  CIKTI,
  JSON.stringify(
    {
      kaynak: KOK,
      alinma: new Date().toISOString().slice(0, 10),
      aciklama: `Türkiye Yüzyılı Maarif Modeli temel eğitim (${ad}) öğretim programları; tymm.meb.gov.tr ünite sayfalarından birebir alınmıştır (scripts/tymm-temel-egitim.mjs).`,
      programlar,
    },
    null,
    1
  ) + "\n"
);
console.log(`\n${toplamUnite} ünite, ${gorulen.size} öğrenme çıktısı → ${CIKTI}`);
if (uyarilar.length) console.log("UYARILAR:\n" + uyarilar.join("\n"));
}

const secilen = process.argv[2] ? [process.argv[2]] : Object.keys(KADEMELER);
for (const k of secilen) {
  if (!KADEMELER[k]) throw new Error(`Bilinmeyen kademe: ${k} (ilkokul | ortaokul)`);
  await kademeCek(k, KADEMELER[k]);
}
