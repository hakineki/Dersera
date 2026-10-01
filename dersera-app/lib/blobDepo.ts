// Vercel Blob iki yolla bağlanır: eski depolarda okuma-yazma belirteci (BLOB_READ_WRITE_TOKEN); yeni depolarda belirteç
// verilmez, BLOB_STORE_ID ve projenin OIDC kimliği kullanılır (projede Settings → Security → OIDC Federation açık olmalı).
// OIDC belirteci istek başlığından (x-vercel-oidc-token), yoksa VERCEL_OIDC_TOKEN'dan okunur: Blob yazma işi istek içinde
// beklenmeli, istek bittikten sonra arka planda çalışmamalı. @vercel/blob ikisini de kendisi çözer (önce OIDC + depo
// kimliği, yoksa belirteç). Biri tanımlıysa depo yapılandırılmış sayılır; değerler hiçbir yerde okunmaz ya da gösterilmez.
export const BLOB_DEGISKENLERI = ["BLOB_STORE_ID", "BLOB_READ_WRITE_TOKEN"] as const;

export const blobTanimli = (env: Record<string, string | undefined> = process.env): boolean => BLOB_DEGISKENLERI.some((a) => !!env[a]?.trim());

export const BLOB_EKSIK = "Blob deposu bağlı değil (BLOB_STORE_ID ya da BLOB_READ_WRITE_TOKEN tanımlı değil)";
