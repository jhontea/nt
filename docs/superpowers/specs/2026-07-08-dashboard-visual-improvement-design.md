# Dashboard Visual Improvement — Design Spec

**Date:** 2026-07-08
**Status:** Approved
**Approach:** Targeted fixes — address specific visual hierarchy problems without structural changes

---

## Problem

Dashboard /sessions setelah filter implementation memiliki masalah visual hierarchy:
1. Stats kurang menonjol — running count tertimbun di teks kecil
2. SessionCard kurang differentiasi — semua card terlihat sama
3. Icon-text balance kurang — preset cards text-heavy, icon flat
4. Terlalu flat / kurang depth — card active/running tidak cukup menonjol
5. Info penting kurang emphasis — nama session, symbol, status running tenggelam

---

## Scope

**In Scope:**
- StatsRow cards: running indicator, active state, tint untuk has-running
- SessionCard: left border per strategi, running state lebih visible, stopped state lebih redup
- Preset cards: icon background, label sizing
- Tidak ada perubahan layout/struktur

**Out of Scope:**
- Perubahan struktur komponen
- Animasi kompleks
- Perubahan warna brand (#9fe870, #38c8ff, #ffd11a)
- Halaman lain selain /sessions

---

## Design Details

### 1. StatsRow Cards

**Running indicator:**
- Jika stat.running > 0: tampilkan dot hijau nimate-pulse di pojok kanan atas kartu
- Ganti teks {stat.running} running dengan badge kecil: ● {stat.running} live
- Kartu dengan running > 0 (tapi bukan active): border subtle green order-[rgba(159,232,112,0.3)]

**Active state:**
- Tambah gradient g-gradient-to-br from-[rgba(159,232,112,0.08)] to-transparent
- Label strategi lebih besar: 	ext-base (naik dari 	ext-sm)

**Inactive state:**
- Total count tetap 	ext-2xl font-black
- Label tetap 	ext-sm font-bold

### 2. SessionCard

**Left border per strategi:**
`
Grid:  border-l-4 border-l-[#9fe870]
Trend: border-l-4 border-l-[#38c8ff]
DCA:   border-l-4 border-l-[#ffd11a]
`

**Running state:**
- Card background subtle tint: g-[rgba(159,232,112,0.02)] dark:bg-[rgba(159,232,112,0.04)]
- Dot status lebih besar: w-2 h-2 (naik dari w-1.5 h-1.5)
- Status badge running: lebih prominent

**Stopped state:**
- Subtle: opacity-90 (tidak terlalu redup, tapi beda dari running)

**Name emphasis:**
- Session name: 	ext-base font-bold (sudah ada, maintain)
- Symbol: 	ext-sm font-semibold (naik dari font-medium)

### 3. Preset Cards

**Icon treatment:**
- Wrap emoji dalam circle background kecil per warna strategi:
  `
  Grid preset:  bg-[rgba(159,232,112,0.15)] rounded-full w-10 h-10
  Trend preset: bg-[rgba(56,200,255,0.12)] rounded-full w-10 h-10
  DCA preset:   bg-[rgba(255,209,26,0.12)] rounded-full w-10 h-10
  `
- Icon size: 	ext-xl di dalam circle

**Typography:**
- Label: 	ext-sm font-bold (sudah ada)
- Desc: 	ext-xs text-[#5a5b58] dark:text-[#8a8d88] (lebih redup dari saat ini)

---

## Color Reference

| Strategi | Warna | Usage |
|----------|-------|-------|
| Grid | #9fe870 | border-l, icon bg, active tint |
| Trend | #38c8ff | border-l, icon bg |
| DCA | #ffd11a | border-l, icon bg |
| Running dot | #9fe870 | animate-pulse indicator |

---

## Files to Modify

- rontend/src/app/sessions/page.tsx
  - StatsRow component (line 93-139)
  - SessionCard component (line ~730+)
  - Preset cards rendering (line ~680+)

---

## Success Criteria

- StatsRow: kartu dengan session running menampilkan dot pulse hijau yang visible
- SessionCard: setiap strategi punya left border warna berbeda
- SessionCard running: card terlihat lebih "active" dari stopped
- Preset cards: icon punya background circle yang memberi visual weight
- Build TypeScript bersih tanpa error
- Dark mode tetap konsisten
