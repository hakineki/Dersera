// Sayfanın yerine baskıya özel bir görünümü basar (ör. mekân rotasının yerleşim çıktısı). Kökteki sınıf baskı CSS'ini
// açar (app/globals.css). Masaüstü tarayıcılarda print() engelleyicidir ve "afterprint" print() dönmeden gelir: bu yüzden
// dinleyici print()'ten ÖNCE kurulur. Olay hiç gelmezse (bazı mobil tarayıcılar) dönen iptal fonksiyonu bir sonraki baskıda
// ya da bileşen kalkarken dinleyiciyi kaldırır; sınıfı çağıran temizler.

export interface SinifListesi {
  add(sinif: string): void;
  remove(sinif: string): void;
}

export interface BaskiPenceresi {
  print(): void;
  addEventListener(tur: "afterprint", dinleyici: () => void, secenek?: { once?: boolean }): void;
  removeEventListener(tur: "afterprint", dinleyici: () => void): void;
}

export function sayfayiBas(kok: SinifListesi, pencere: BaskiPenceresi, sinif: string, bitince: () => void): () => void {
  const bitti = () => {
    kok.remove(sinif);
    bitince();
  };
  pencere.addEventListener("afterprint", bitti, { once: true });
  kok.add(sinif);
  pencere.print();
  return () => pencere.removeEventListener("afterprint", bitti);
}
