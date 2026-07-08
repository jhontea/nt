'use client'
import { Navbar } from '@/components/Navbar'

const terms = [
  {
    term: 'Trading Bot',
    desc: 'Program otomatis yang melakukan jual-beli crypto berdasarkan aturan (strategi) yang sudah ditentukan. Bot bekerja 24/7 tanpa perlu diawasi terus-menerus.',
  },
  {
    term: 'Signal / Sinyal',
    desc: 'Peringatan dari bot bahwa saat yang tepat untuk membeli atau menjual. Di mode Signal, bot hanya memberi sinyal — Anda yang memutuskan untuk eksekusi atau tidak.',
  },
  {
    term: 'Grid Trading',
    desc: 'Strategi memasang order beli di harga rendah dan order jual di harga tinggi secara berulang dalam range harga tertentu. Semakin banyak grid, semakin rapat level harganya. Cocok untuk pasar yang sideways (harga bergerak naik-turun dalam range).',
  },
  {
    term: 'Trend Following',
    desc: 'Strategi yang mengikuti arah pasar. Jika harga sedang naik (uptrend), bot akan membeli. Jika harga sedang turun (downtrend), bot akan menjual. Strategi ini menggunakan indikator SMA untuk mendeteksi tren.',
  },
  {
    term: 'SMA (Simple Moving Average)',
    desc: 'Rata-rata harga penutupan dalam periode tertentu. Contoh: SMA 10 = rata-rata harga 10 candle terakhir. SMA cepat (fast) lebih sensitif terhadap perubahan harga, SMA lambat (slow) lebih stabil.',
  },
  {
    term: 'Golden Cross',
    desc: 'Sinyal BELI. Terjadi ketika SMA cepat (misal SMA 10) naik melewati SMA lambat (misal SMA 30). Menandakan awal tren naik.',
  },
  {
    term: 'Death Cross',
    desc: 'Sinyal JUAL. Terjadi ketika SMA cepat turun melewati SMA lambat. Menandakan awal tren turun.',
  },
  {
    term: 'Mode Signal',
    desc: 'Mode paling aman. Bot hanya menganalisis pasar dan mencatat sinyal. Tidak ada uang yang digunakan. Cocok untuk belajar dan menguji strategi.',
  },
  {
    term: 'Paper Trading',
    desc: 'Mode simulasi. Bot melakukan trading dengan uang virtual ($1000 saldo awal). Hasil trading (profit/rugi) dicatat secara virtual. Cocok untuk menguji strategi tanpa risiko kehilangan uang sungguhan.',
  },
  {
    term: 'Live Trading',
    desc: 'Mode trading sungguhan. Bot menggunakan API key TokoCrypto Anda untuk melakukan jual-beli real di akun Anda. RISIKO TINGGI — pastikan strategi sudah teruji sebelum menggunakan mode ini.',
  },
  {
    term: 'P&L (Profit and Loss)',
    desc: 'Keuntungan dan kerugian dari hasil trading. P&L positif (+) berarti untung, negatif (-) berarti rugi.',
  },
  {
    term: 'Realized P&L',
    desc: 'Keuntungan/kerugian dari posisi yang sudah ditutup (sudah dijual). Ini adalah profit/rugi yang sudah "real" atau pasti.',
  },
  {
    term: 'Unrealized P&L',
    desc: 'Keuntungan/kerugian dari posisi yang masih terbuka (belum dijual). Masih bisa berubah mengikuti harga pasar.',
  },
  {
    term: 'Virtual Balance',
    desc: 'Saldo virtual untuk Paper Trading. Dimulai dari $1000. Bertambah jika profit, berkurang jika rugi. Bukan uang sungguhan.',
  },
  {
    term: 'Trading Pair',
    desc: 'Pasangan mata uang crypto yang diperdagangkan. Contoh: BTC_USDT berarti membeli/menjual Bitcoin menggunakan USDT. ETH_IDR berarti ETH menggunakan Rupiah.',
  },
  {
    term: 'Order',
    desc: 'Pesanan untuk membeli atau menjual crypto. Ada dua jenis utama: Market Order (langsung dieksekusi di harga pasar) dan Limit Order (dieksekusi di harga tertentu).',
  },
  {
    term: 'Market Order',
    desc: 'Order yang langsung dieksekusi di harga pasar terbaik yang tersedia. Cepat, tapi harga final bisa sedikit berbeda dari harga yang terlihat (slippage).',
  },
  {
    term: 'Limit Order',
    desc: 'Order yang hanya dieksekusi jika harga mencapai level yang ditentukan. Contoh: pasang Limit Order beli BTC di harga 60,000 — order hanya jalan jika harga BTC turun ke 60,000.',
  },
  {
    term: 'API Key',
    desc: 'Kunci akses yang menghubungkan bot trading ke akun TokoCrypto Anda. Dapatkan dari website TokoCrypto &gt; Settings &gt; API Management. Jaga kerahasiaan API Key dan Secret Key Anda!',
  },
  {
    term: 'Session',
    desc: 'Satu sesi trading dengan strategi, pair, dan konfigurasi tertentu. Anda bisa membuat banyak session dengan strategi berbeda secara bersamaan.',
  },
  {
    term: 'Win Rate',
    desc: 'Persentase jumlah trade yang profit dibanding total trade. Contoh: Win Rate 60% berarti dari 10 trade, 6 di antaranya profit.',
  },
  {
    term: 'Balance',
    desc: 'Saldo akun. Untuk Paper Trading, balance awal $1000. Untuk Live Trading, balance adalah saldo real akun TokoCrypto Anda.',
  },
  {
    term: 'Grid Count',
    desc: 'Jumlah level harga dalam strategi Grid Trading. Makin banyak grid, makin rapat jarak antar level. Contoh: range harga 60,000-70,000 dengan grid count 10 berarti ada 10 level dengan jarak ~$1,000 per level.',
  },
  {
    term: 'Candlestick / Candle',
    desc: 'Grafik yang menampilkan harga open, high, low, close dalam periode tertentu (1 menit, 5 menit, 1 jam, dll). Setiap "candle" mewakili satu periode.',
  },
  {
    term: 'Slippage',
    desc: 'Perbedaan antara harga yang diharapkan dengan harga eksekusi aktual. Terjadi saat pasar bergerak cepat. Makin likuid pair-nya, makin kecil slippage.',
  },
  {
    term: 'DCA (Dollar Cost Average)',
    desc: 'Strategi membeli aset dalam jumlah tetap secara rutin (misal $10 setiap hari), tanpa peduli harga naik atau turun. Tujuannya adalah merata-ratakan harga beli sehingga tidak perlu timing pasar. Cocok untuk investasi jangka panjang.',
  },
  {
    term: 'Take Profit',
    desc: 'Level harga dimana bot akan menjual untuk mengunci keuntungan. Contoh: take profit 5% berarti bot akan menjual jika harga naik 5% dari harga rata-rata beli.',
  },
  {
    term: 'Interval DCA',
    desc: 'Jarak waktu antar pembelian pada strategi DCA. Contoh: interval 1 jam berarti bot akan membeli setiap 1 jam sekali. Makin pendek interval, makin sering beli. Pilihan umum: 1 jam, 6 jam, 12 jam, 1 hari, 1 minggu.',
  },
]

export default function GlossaryPage() {
  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#141411]">
      <Navbar active="glossary" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-3xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight mb-1">Glosarium</h1>
        <p className="text-sm text-[#686868] dark:text-[#898989] mb-8">Istilah-istilah yang digunakan di aplikasi Trading Bot, dijelaskan dalam bahasa sederhana.</p>

        <div className="space-y-2">
          {terms.map(t => (
            <details key={t.term} className="bg-white dark:bg-[#1e201c] rounded-[16px] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] overflow-hidden group">
              <summary className="px-5 py-4 cursor-pointer hover:bg-[#eaece8] dark:hover:bg-[#252822] transition font-semibold text-[#0e0f0c] dark:text-[#e8ebe6] text-sm flex items-center justify-between list-none gap-4">
                <span className="flex-1 min-w-0">{t.term}</span>
                <span className="text-[#686868] dark:text-[#898989] group-open:rotate-180 transition-transform text-xs flex-shrink-0">▼</span>
              </summary>
              <div className="px-5 pt-1 pb-4 text-sm text-[#686868] dark:text-[#898989] leading-relaxed border-t border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)]">
                {t.desc}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}
