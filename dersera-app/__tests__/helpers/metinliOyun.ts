import type { GameDefinition } from "@/lib/composer/definition";

// Benzerlik testleri için: fixture oyunun kısa metinlerini tohuma özgü uzun metinlerle doldurur. Aynı tohum aynı
// metni, farklı tohum ortak kelimesi olmayan metni üretir.
export function metinli(def: GameDefinition, tohum: string): GameDefinition {
  const cumle = (yer: string, n: number) => Array.from({ length: n }, (_, j) => `${tohum}${yer}w${j}`).join(" ");
  def.hikaye_giris = cumle("giris", 12);
  def.duraklar.forEach((d, i) => {
    d.hikaye_metni = cumle(`h${i}`, 12);
    d.gorev.soru = cumle(`s${i}`, 8);
  });
  def.final.hikaye_metni = cumle("final", 10);
  return def;
}

// Aynı konuda (Newton'un ikinci yasası) iki öğretmenin bağımsız yazdığı gerçekçi metinler: ortak müfredat ifadeleri
// ve aynı sayısal şıklar içerir, anlatım farklıdır. Yanlış pozitif kalibrasyonu için.
const OGRETMEN_A = [
  ["Laboratuvarda bir araba rampadan aşağı iniyor ve ekip hızlanmanın nedenini araştırıyor.", "Kütlesi 5 kg olan arabaya 20 N net kuvvet uygulanırsa arabanın ivmesi kaç metre bölü saniye karedir?"],
  ["Deney masasında iki farklı el arabası duruyor ve hangisinin daha zor itildiğini merak ediyorsunuz.", "Newton'un ikinci yasasına göre net kuvvet sabitken kütle artarsa ivme nasıl değişir?"],
  ["Spor salonunda halter kaldıran sporcunun hareketini inceleyen ekip not defterini açıyor.", "Kuvvet kütle ile ivmenin çarpımıdır ifadesine göre 10 kg kütleye 2 m/s² ivme kazandıran kuvvet nedir?"],
  ["Buz pistinde kayan patenci ile sürtünmesiz ortamda hareketin sürüp sürmeyeceği tartışılıyor.", "Sürtünmesiz yatay düzlemde net kuvvet sıfır olursa cismin hızı ne olur?"],
  ["Otobüs aniden fren yapınca yolcuların öne doğru savrulduğunu gören öğrenciler sebebi soruyor.", "Aniden duran otobüste yolcuların öne savrulmasının nedeni hangi kavramla açıklanır?"],
  ["Roket fırlatma rampasında mühendisler motorun ürettiği itme kuvvetini hesaplıyor.", "Kütlesi 2 kg olan model rokete 30 N itme ve 20 N ağırlık etki ederse net kuvvet kaç newtondur?"],
  ["Market arabasını iten öğrenci boş ve dolu arabayı karşılaştırarak gözlem yapıyor.", "Aynı kuvvetle itilen boş ve dolu market arabasından hangisi daha büyük ivme kazanır?"],
  ["Final öncesi ekip tüm gözlemleri birleştirip kuvvet ivme ilişkisini tabloya döküyor.", "Net kuvvet iki katına çıkarsa ve kütle değişmezse ivme nasıl değişir?"],
];
const OGRETMEN_B = [
  ["Okul bahçesindeki kaykay pistinde bir öğrenci eğimli yoldan kayarak hız kazanıyor.", "Net kuvvet 20 N ve kütle 5 kg ise kaykayın kazandığı ivme kaçtır?"],
  ["Bilim kulübü farklı ağırlıktaki kutuları iterek hangisinin daha yavaş hızlandığını ölçüyor.", "Newton'un ikinci yasasına göre aynı kuvvet uygulanan daha ağır kutunun ivmesi için ne söylenebilir?"],
  ["Bir vinç operatörü yükü yukarı kaldırırken halatın gerilmesini kontrol ediyor.", "Kuvvet kütle ile ivmenin çarpımıdır; 10 kg yükü 2 m/s² ile hızlandırmak için gereken kuvvet kaç newtondur?"],
  ["Hava hokeyi masasında pul neredeyse hiç yavaşlamadan karşı kaleye doğru süzülüyor.", "Üzerine etki eden kuvvetler dengelenmiş bir pulun hareketi nasıl devam eder?"],
  ["Hızla dönen bir atlı karıncada çocuklar dışarı doğru itildiklerini hissediyor.", "Hareket durumunu koruma eğilimine fizikte hangi ad verilir?"],
  ["Uzay ajansının maketinde öğrenciler motoru çalıştırıp kalkış anını izliyor.", "Yukarı 30 N, aşağı 20 N kuvvet etki eden cisme etki eden bileşke kuvvet kaçtır?"],
  ["Kargo şirketinde çalışan görevli ağır ve hafif paketleri aynı kuvvetle kaydırıyor.", "Aynı kuvvetle kaydırılan hafif paket ile ağır paketin ivmelerini karşılaştırınız."],
  ["Ekip macera boyunca topladığı ölçümleri bir grafikte birleştirmeye hazırlanıyor.", "Kütle sabit kalırken uygulanan kuvvet artırılırsa ivme grafiği nasıl görünür?"],
];

export function gercekciOyun(def: GameDefinition, ogretmen: "a" | "b"): GameDefinition {
  const metin = ogretmen === "a" ? OGRETMEN_A : OGRETMEN_B;
  def.hikaye_giris = ogretmen === "a" ? "Fizik laboratuvarında garip bir şeyler oluyor ve ekip kuvvetin sırrını çözmek zorunda." : "Okulun bilim şenliğinde her şey hareket hâlinde ve kuvvetin gizemini siz çözeceksiniz.";
  def.duraklar.forEach((d, i) => {
    const [hikaye, soru] = metin[i % metin.length];
    d.hikaye_metni = hikaye;
    d.gorev.soru = soru;
    // Aynı sayısal şıklar iki oyunda da var.
    d.gorev.secenekler = ["2 m/s²", "4 m/s²", "10 m/s²", "20 m/s²"];
    d.gorev.dogru_cevap = "4 m/s²";
  });
  return def;
}
