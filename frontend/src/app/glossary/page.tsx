'use client'
import { useState } from 'react'
import { Navbar } from '@/components/Navbar'

type Category = 'strategi' | 'mode' | 'indikator' | 'order' | 'umum'

const terms: Array<{ term: string; desc: string; category: Category }> = [
  {
    term: 'Trading Bot',
    desc: 'Program otomatis yang melakukan jual-beli crypto berdasarkan aturan (strategi) yang sudah ditentukan. Bot bekerja 24/7 tanpa perlu diawasi terus-menerus.',
    category: 'umum',
  },
  {
    term: 'Signal / Sinyal',
    desc: 'Peringatan dari bot bahwa saat yang tepat untuk membeli atau menjual. Di mode Signal, bot hanya memberi sinyal — Anda yang memutuskan untuk eksekusi atau tidak.',
    category: 'mode',
  },
  {
    term: 'Grid Trading',
    desc: 'Strategi memasang order beli di harga rendah dan order jual di harga tinggi secara berulang dalam range harga tertentu. Semakin banyak grid, semakin rapat level harganya. Cocok untuk pasar yang sideways (harga bergerak naik-turun dalam range).',
    category: 'strategi',
  },
  {
    term: 'Trend Following',
    desc: 'Strategi yang mengikuti arah pasar. Jika harga sedang naik (uptrend), bot akan membeli. Jika harga sedang turun (downtrend), bot akan menjual. Strategi ini menggunakan indikator SMA untuk mendeteksi tren.',
    category: 'strategi',
  },
  {
    term: 'SMA (Simple Moving Average)',
    desc: 'Rata-rata harga penutupan dalam periode tertentu. Contoh: SMA 10 = rata-rata harga 10 candle terakhir. SMA cepat (fast) lebih sensitif terhadap perubahan harga, SMA lambat (slow) lebih stabil.',
    category: 'indikator',
  },
  {
    term: 'Golden Cross',
    desc: 'Sinyal BELI. Terjadi ketika SMA cepat (misal SMA 10) naik melewati SMA lambat (misal SMA 30). Menandakan awal tren naik.',
    category: 'indikator',
  },
  {
    term: 'Death Cross',
    desc: 'Sinyal JUAL. Terjadi ketika SMA cepat turun melewati SMA lambat. Menandakan awal tren turun.',
    category: 'indikator',
  },
  {
    term: 'Mode Signal',
    desc: 'Mode paling aman. Bot hanya menganalisis pasar dan mencatat sinyal. Tidak ada uang yang digunakan. Cocok untuk belajar dan menguji strategi.',
    category: 'mode',
  },
  {
    term: 'Paper Trading',
    desc: 'Mode simulasi. Bot melakukan trading dengan uang virtual ($1000 saldo awal). Hasil trading (profit/rugi) dicatat secara virtual. Cocok untuk menguji strategi tanpa risiko kehilangan uang sungguhan.',
    category: 'mode',
  },
  {
    term: 'Live Trading',
    desc: 'Mode trading sungguhan. Bot menggunakan API key TokoCrypto Anda untuk melakukan jual-beli real di akun Anda. RISIKO TINGGI — pastikan strategi sudah teruji sebelum menggunakan mode ini.',
    category: 'mode',
  },
  {
    term: 'P&L (Profit and Loss)',
    desc: 'Keuntungan dan kerugian dari hasil trading. P&L positif (+) berarti untung, negatif (-) berarti rugi.',
    category: 'umum',
  },
  {
    term: 'Realized P&L',
    desc: 'Keuntungan/kerugian dari posisi yang sudah ditutup (sudah dijual). Ini adalah profit/rugi yang sudah "real" atau pasti.',
    category: 'umum',
  },
  {
    term: 'Unrealized P&L',
    desc: 'Keuntungan/kerugian dari posisi yang masih terbuka (belum dijual). Masih bisa berubah mengikuti harga pasar.',
    category: 'umum',
  },
  {
    term: 'Virtual Balance',
    desc: 'Saldo virtual untuk Paper Trading. Dimulai dari $1000. Bertambah jika profit, berkurang jika rugi. Bukan uang sungguhan.',
    category: 'umum',
  },
  {
    term: 'Trading Pair',
    desc: 'Pasangan mata uang crypto yang diperdagangkan. Contoh: BTC_USDT berarti membeli/menjual Bitcoin menggunakan USDT. ETH_IDR berarti ETH menggunakan Rupiah.',
    category: 'umum',
  },
  {
    term: 'Order',
    desc: 'Pesanan untuk membeli atau menjual crypto. Ada dua jenis utama: Market Order (langsung dieksekusi di harga pasar) dan Limit Order (dieksekusi di harga tertentu).',
    category: 'order',
  },
  {
    term: 'Market Order',
    desc: 'Order yang langsung dieksekusi di harga pasar terbaik yang tersedia. Cepat, tapi harga final bisa sedikit berbeda dari harga yang terlihat (slippage).',
    category: 'order',
  },
  {
    term: 'Limit Order',
    desc: 'Order yang hanya dieksekusi jika harga mencapai level yang ditentukan. Contoh: pasang Limit Order beli BTC di harga 60,000 — order hanya jalan jika harga BTC turun ke 60,000.',
    category: 'order',
  },
  {
    term: 'API Key',
    desc: 'Kunci akses yang menghubungkan bot trading ke akun TokoCrypto Anda. Dapatkan dari website TokoCrypto &gt; Settings &gt; API Management. Jaga kerahasiaan API Key dan Secret Key Anda!',
    category: 'umum',
  },
  {
    term: 'Session',
    desc: 'Satu sesi trading dengan strategi, pair, dan konfigurasi tertentu. Anda bisa membuat banyak session dengan strategi berbeda secara bersamaan.',
    category: 'umum',
  },
  {
    term: 'Win Rate',
    desc: 'Persentase jumlah trade yang profit dibanding total trade. Contoh: Win Rate 60% berarti dari 10 trade, 6 di antaranya profit.',
    category: 'umum',
  },
  {
    term: 'Balance',
    desc: 'Saldo akun. Untuk Paper Trading, balance awal $1000. Untuk Live Trading, balance adalah saldo real akun TokoCrypto Anda.',
    category: 'umum',
  },
  {
    term: 'Grid Count',
    desc: 'Jumlah level harga dalam strategi Grid Trading. Makin banyak grid, makin rapat jarak antar level. Contoh: range harga 60,000-70,000 dengan grid count 10 berarti ada 10 level dengan jarak ~$1,000 per level.',
    category: 'strategi',
  },
  {
    term: 'Candlestick / Candle',
    desc: 'Grafik yang menampilkan harga open, high, low, close dalam periode tertentu (1 menit, 5 menit, 1 jam, dll). Setiap "candle" mewakili satu periode.',
    category: 'indikator',
  },
  {
    term: 'Slippage',
    desc: 'Perbedaan antara harga yang diharapkan dengan harga eksekusi aktual. Terjadi saat pasar bergerak cepat. Makin likuid pair-nya, makin kecil slippage.',
    category: 'order',
  },
  {
    term: 'DCA (Dollar Cost Average)',
    desc: 'Strategi membeli aset dalam jumlah tetap secara rutin (misal $10 setiap hari), tanpa peduli harga naik atau turun. Tujuannya adalah merata-ratakan harga beli sehingga tidak perlu timing pasar. Cocok untuk investasi jangka panjang.',
    category: 'strategi',
  },
  {
    term: 'Take Profit',
    desc: 'Level harga dimana bot akan menjual untuk mengunci keuntungan. Contoh: take profit 5% berarti bot akan menjual jika harga naik 5% dari harga rata-rata beli.',
    category: 'strategi',
  },
  {
    term: 'Interval DCA',
    desc: 'Jarak waktu antar pembelian pada strategi DCA. Contoh: interval 1 jam berarti bot akan membeli setiap 1 jam sekali. Makin pendek interval, makin sering beli. Pilihan umum: 1 jam, 6 jam, 12 jam, 1 hari, 1 minggu.',
    category: 'strategi',
  },
]

const categoryColors: Record<Category, string> = {
  strategi: 'bg-[rgba(159,232,112,0.12)] text-[#163300] dark:text-[#9fe870]',
  mode: 'bg-[rgba(56,200,255,0.1)] text-[#0994b3] dark:text-[#5dd8f5]',
  indikator: 'bg-[rgba(255,209,26,0.12)] text-[#7a5f00] dark:text-[#f5c842]',
  order: 'bg-[rgba(208,50,56,0.08)] text-[#d03238] dark:text-[#ff6b6f]',
  umum: 'bg-[rgba(14,15,12,0.06)] dark:bg-[rgba(232,235,230,0.06)] text-[#686868] dark:text-[#898989]',
}

export default function GlossaryPage() {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('all')

  const filtered = terms.filter(t =>
    (activeCategory === 'all' || t.category === activeCategory) &&
    (search === '' || t.term.toLowerCase().includes(search.toLowerCase()) || t.desc.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#141411]">
      <Navbar active="glossary" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-3xl font-black text-[#0e0f0c] dark:text-[#e8ebe6] tracking-tight mb-1">Glosarium</h1>
        <p className="text-sm text-[#686868] dark:text-[#898989] mb-8">Menampilkan {filtered.length} dari {terms.length} istilah</p>

        <div className="flex flex-wrap gap-2 mb-4">
          {(['all', 'strategi', 'mode', 'indikator', 'order', 'umum'] as const).map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                activeCategory === cat
                  ? 'bg-[#9fe870] text-[#163300] shadow-[0_2px_8px_rgba(159,232,112,0.3)]'
                  : 'bg-[#f0f1ee] dark:bg-[#252822] text-[#686868] dark:text-[#898989] hover:bg-[rgba(14,15,12,0.08)] dark:hover:bg-[rgba(232,235,230,0.08)]'
              }`}>
              {cat === 'all' ? 'Semua' : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        <div className="relative mb-6">
          <input
            type="text"
            placeholder="Cari istilah..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Cari istilah trading"
            className="w-full px-4 py-3 pl-10 bg-white dark:bg-[#1e201c] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] rounded-[14px] text-sm text-[#0e0f0c] dark:text-[#e8ebe6] placeholder-[#686868] dark:placeholder-[#898989] focus:outline-none focus:ring-2 focus:ring-[rgba(159,232,112,0.4)] focus:border-[#9fe870]"
          />
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#686868] dark:text-[#898989] text-sm pointer-events-none">🔍</span>
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <p className="text-[#686868] dark:text-[#898989] text-sm">
                {search && activeCategory !== 'all'
                  ? `Tidak ada istilah di kategori "${activeCategory}" yang cocok dengan "${search}"`
                  : search
                  ? `Tidak ada istilah yang cocok dengan "${search}"`
                  : `Tidak ada istilah di kategori "${activeCategory}"`
                }
              </p>
            <button onClick={() => { setSearch(''); setActiveCategory('all') }} className="mt-2 text-[#9fe870] text-sm font-medium hover:underline">Reset semua filter</button>
          </div>
        )}

        <div className="space-y-2">
          {filtered.map(t => (
            <details key={t.term} className="bg-white dark:bg-[#1e201c] rounded-[16px] border border-[rgba(14,15,12,0.08)] dark:border-[rgba(232,235,230,0.08)] overflow-hidden group">
              <summary className="px-5 py-4 cursor-pointer hover:bg-[#f0f1ee] dark:hover:bg-[#252822] transition font-semibold text-[#0e0f0c] dark:text-[#e8ebe6] text-sm flex items-center justify-between list-none gap-4">
                <span className="flex-1 min-w-0 flex items-center gap-2">
                  {t.term}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${categoryColors[t.category]}`}>
                    {t.category.charAt(0).toUpperCase() + t.category.slice(1)}
                  </span>
                </span>
                <span className="text-[#686868] dark:text-[#898989] group-open:rotate-180 transition-transform duration-200 text-xs flex-shrink-0">▼</span>
              </summary>
              <div className="px-5 pt-1 pb-4 text-sm text-[#0e0f0c] dark:text-[#e8ebe6] leading-relaxed border-t border-[rgba(14,15,12,0.06)] dark:border-[rgba(232,235,230,0.06)]">
                {t.desc}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}
