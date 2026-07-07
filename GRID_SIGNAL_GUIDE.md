# Panduan Menggunakan Grid Signal

## Apa itu Grid Signal

Grid Signal adalah bot yang memantau pergerakan harga dalam rentang tertentu dan memberi sinyal beli/jual saat harga menyentuh level grid.

**Grid Signal TIDAK mengeksekusi order otomatis.** Bot hanya memberi sinyal — Anda yang memutuskan untuk trading atau tidak.

## Cara Membuat Grid Signal

### Mode Pemula (Recommended)

1. Buka dashboard → klik **+ New Session**
2. Pilih strategi: **Grid Trading**
3. Pilih mode: **Signal**
4. Di bagian "Mode", pastikan **🎓 Pemula** aktif
5. Isi form:
   - **Pair**: pilih pair crypto (default BTC_USDT)
   - **Horizon**:
     - `Pendek` — range sempit (±5-10%), sinyal lebih sering
     - `Menengah` — range sedang (±10-18%), seimbang
     - `Panjang` — range lebar (±15-25%), sinyal lebih jarang
   - **Modal**: berapa USDT yang dialokasikan (contoh: 100). Sistem hitung otomatis quantity per order
   - **Validasi**:
     - `Step Grid` — sinyal dianggap benar jika harga naik 2 level grid
     - `Persentase` — sinyal dianggap benar jika harga naik 1%+
6. Klik **🔄 Rekomendasi** — sistem akan menghitung upper/lower/grid/qty otomatis dari API
7. Lihat preview rekomendasi di bawahnya — menampilkan range, grid count, step, qty, dan alasan rekomendasi
8. Klik **Buat Session**

### Mode Manual

1. Pilih **⚙️ Manual**
2. Isi sendiri: Harga Atas, Harga Bawah, Jumlah Grid, Quantity per Order
3. Klik **Buat Session**

## Rekomendasi Default per Pair

Sistem otomatis menghitung rekomendasi berdasarkan kelas pair:

| Pair | Kelas | Range Pendek | Range Menengah | Range Panjang |
|------|-------|-------------|---------------|--------------|
| BTC, ETH, BNB | Stabil | ±5% | ±10% | ±15% |
| SOL, DOT, DOGE | Volatil | ±7% | ±12% | ±18% |
| SHIB | Sangat Volatil | ±10% | ±18% | ±25% |

## Cara Kerja

1. **Start session** — klik Start di card session
2. **Bot evaluasi tiap 30 detik** — cek apakah harga menyentuh level grid
3. **Satu sinyal per level** — level yang sudah tersentuh tidak mengirim sinyal lagi sampai harga menjauh dan kembali
4. **Sinyal tercatat otomatis** — muncul di halaman detail sebagai tabel histori
5. **Validasi otomatis** — setiap signal dicek apakah target tercapai dalam waktu evaluasi (default 2 jam)

## Membaca Hasil

Buka halaman detail session (`/sessions/:id`), Anda akan melihat:

### Ringkasan Sinyal Grid
- Total sinyal yang telah keluar
- Success Rate — berapa % sinyal yang confirmed
- Confirmed / Invalidated / Expired — jumlah masing-masing status
- Buy / Sell — distribusi sinyal beli vs jual

### Tabel Histori Sinyal
Setiap row menampilkan:
- **Waktu** — kapan sinyal keluar
- **Sisi** — buy (hijau) atau sell (merah)
- **Level** — level grid ke berapa (#0 = paling bawah)
- **Harga** — harga level grid
- **Qty** — quantity per order
- **Status validasi**:
  - `pending` — masih menunggu evaluasi (kuning)
  - `confirmed` — target tercapai (hijau)
  - `invalidated` — bergerak berlawanan (merah)
  - `expired` — waktu habis tanpa keputusan (abu-abu)
- **Hasil** — persentase pergerakan setelah sinyal

### Tips Membaca Validasi

- Success Rate **>50%** — setting bagus untuk pair ini
- Banyak `invalidated` — range terlalu sempit atau pair terlalu volatil
- Banyak `expired` — range terlalu lebar, target tidak tercapai dalam window evaluasi
- Banyak `pending` — session baru mulai, tunggu beberapa jam

## Kapan Sinyal Dianggap Benar/Salah

### Mode Step Grid (default)
- Target: harga bergerak **2 level grid** ke arah yang menguntungkan
- Invalid: harga bergerak **1 level grid** berlawanan
- Window: 2 jam (default, bisa berbeda per pair)

### Mode Persentase
- Target: harga bergerak **~1%** (tergantung rekomendasi)
- Invalid: harga bergerak **~0.5%** berlawanan

## Contoh Praktis

**Session: BTC_USDT, Medium, Modal $100**

1. Sistem rekomendasi:
   - Upper: 70,400, Lower: 57,600
   - Grid: 10 level, Step: 1,280
   - Qty: 0.000156 BTC per order
   - Validasi: 2 step dalam 4 jam

2. Bot mulai berjalan

3. Harga BTC turun ke 60,000:
   - Level grid di 60,000 tersentuh
   - Sinyal **BUY** keluar di level 0
   - Status: pending

4. 2 jam kemudian, harga BTC naik ke 63,000:
   - Naik ~2.3 step grid (melebihi target 2)
   - Sinyal berubah jadi **confirmed**
   - Success: +2.3%

5. Di halaman detail:
   - Total: 1 sinyal
   - Confirmed: 1
   - Success Rate: 100%

## Parameter Penting

| Parameter | Artinya | Tips |
|-----------|---------|------|
| **Horizon** | Seberapa lebar range grid | Pendek = lebih sering sinyal, Panjang = lebih selektif |
| **Modal** | Total alokasi dana untuk grid | Jangan >50% dana total Anda |
| **Grid Count** | Jumlah level | Banyak = rapat = sering sinyal tapi profit kecil per sinyal |
| **Quantity** | Aset per order | Dihitung otomatis dari modal / grid count / harga |
| **Validation Window** | Waktu evaluasi sinyal | Makin pendek = hasil lebih cepat tapi bisa expired |

## Troubleshooting

| Masalah | Kemungkinan Penyebab | Solusi |
|---------|---------------------|--------|
| Tidak ada sinyal | Harga tidak menyentuh level grid | Perkecil range atau kurangi grid count |
| Terlalu banyak sinyal | Range terlalu sempit | Perbesar horizon ke Menengah atau Panjang |
| Success Rate rendah | Setting tidak cocok untuk pair | Coba pair yang lebih stabil atau perbesar horizon |
| Semua sinyal expired | Window evaluasi terlalu pendek | Pakai horizon lebih panjang (window otomatis lebih lama) |

## Catatan Penting

- Grid Signal adalah **alat bantu analisis**, bukan rekomendasi trading
- Sinyal tidak menjamin profit — selalu lakukan analisis sendiri
- Mulai dari **Signal mode** dulu untuk belajar pola sinyal
- Naik ke **Paper mode** untuk simulasi dengan uang virtual $1000
- Baru ke **Live mode** setelah yakin dengan strategi
