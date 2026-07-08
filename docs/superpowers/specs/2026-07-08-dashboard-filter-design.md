# Dashboard Sessions Filter & Stats - Design Specification

**Date:** 2026-07-08  
**Status:** Approved  
**Author:** AI Assistant

---

## Problem

Dashboard `/sessions` saat ini menampilkan semua session dalam satu list tanpa kemampuan filter. User memiliki 2 session Grid Signal, 2 Grid Paper, dan 2 Trending Signal, sehingga sulit untuk fokus pada strategi tertentu.

---

## Goal

Tambahkan filter tab pills berdasarkan strategi trading (Grid/Trend/DCA) + stats row yang menampilkan ringkasan per strategi (jumlah session, berapa yang running).

---

## Scope

**In Scope:**
- Filter tab pills: `All | Grid | Trend | DCA`
- Stats row (4 kartu ringkas) menampilkan total session + running count per strategi
- Filter client-side (tidak perlu API endpoint baru)
- Empty state spesifik per filter

**Out of Scope:**
- Filter berdasarkan mode (Signal/Paper/Live) atau status (Running/Stopped)
- Persist filter ke URL query param
- Perubahan pada SessionCard, form create, atau presets
- Filter di halaman lain selain `/sessions`

---

## Design

### 1. Stats Row

Posisi: Di antara market ticker dan list session (sebelum preset cards atau session list).

**Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│  [ All · 4 ]  [ 📐 Grid · 2 ]  [ 📈 Trend · 1 ]  [ 🪙 DCA · 1 ]  │
│    1 running      1 running        0 running       0 running │
└──────────────────────────────────────────────────────────────┘
```

Setiap kartu:
- Icon strategi + label
- Total session untuk strategi itu
- Jumlah yang sedang `running`
- Kartu yang aktif (tab terpilih) dapat highlight border/bg `#9fe870`
- Click kartu = switch filter

**Styling:**
- Grid 4 kolom (responsive: 2 kolom di mobile)
- Background: `bg-white dark:bg-[#1e201c]`
- Border rounded `rounded-[16px]`
- Hover state: border color berubah
- Active state: border `border-[#9fe870]` + subtle bg tint

---

### 2. Filter Logic (Client-Side)

**State:**
```tsx
const [activeFilter, setActiveFilter] = useState<'all' | 'grid' | 'trend' | 'dca'>('all')
```

**Filter function:**
```tsx
const filteredSessions = sessions?.filter(s => 
  activeFilter === 'all' ? true : s.strategy === activeFilter
)
```

**Stats calculation:**
```tsx
const stats = {
  all: { total: sessions.length, running: sessions.filter(s => s.status === 'running').length },
  grid: { total: sessions.filter(s => s.strategy === 'grid').length, running: sessions.filter(s => s.strategy === 'grid' && s.status === 'running').length },
  trend: { total: sessions.filter(s => s.strategy === 'trend').length, running: sessions.filter(s => s.strategy === 'trend' && s.status === 'running').length },
  dca: { total: sessions.filter(s => s.strategy === 'dca').length, running: sessions.filter(s => s.strategy === 'dca' && s.status === 'running').length },
}
```

---

### 3. Empty State per Filter

Jika `filteredSessions.length === 0` dan filter bukan 'all':

```tsx
<div className="text-center py-16">
  <div className="w-14 h-14 rounded-[24px] bg-[rgba(159,232,112,0.1)] flex items-center justify-center text-2xl mx-auto mb-4">
    {activeFilter === 'grid' ? '📐' : activeFilter === 'trend' ? '📈' : '🪙'}
  </div>
  <p className="text-[#0e0f0c] dark:text-[#e8ebe6] text-lg font-bold">
    Belum ada session {activeFilter === 'grid' ? 'Grid' : activeFilter === 'trend' ? 'Trend' : 'DCA'}
  </p>
  <p className="text-[#686868] dark:text-[#898989] text-sm mt-1">
    Klik "+ New Session" atau pilih preset di atas
  </p>
</div>
```

---

### 4. Component Structure

```
SessionsPage
├─ Navbar
├─ Page header (title + "+ New Session")
├─ Market Ticker (unchanged)
├─ Create Form (conditional, unchanged)
├─ **Stats Row (NEW)** ← 4 kartu filter + stats
├─ Preset cards (conditional, unchanged)
└─ Session list (filtered) atau empty state
```

---

## Implementation Notes

**File to modify:**
- `frontend/src/app/sessions/page.tsx`

**Changes:**
1. Add `activeFilter` state
2. Add `stats` calculation (derived dari `sessions`)
3. Add `filteredSessions` (derived dari `sessions` + `activeFilter`)
4. Add StatsRow component (inline atau extract ke function)
5. Replace `sessions.map()` dengan `filteredSessions.map()`
6. Update empty state logic untuk cek filter

**No backend changes required** — semua filtering di client.

---

## Visual Reference

Active filter: border hijau `#9fe870`, subtle bg `rgba(159,232,112,0.08)`  
Inactive filter: border `rgba(14,15,12,0.08)`, hover `rgba(14,15,12,0.12)`

Typography:
- Strategi label: `text-sm font-bold`
- Count: `text-2xl font-black`
- Running status: `text-xs text-[#686868]`

---

## Success Criteria

- User dapat klik kartu stats untuk filter session berdasarkan strategi
- Count di setiap kartu akurat (total + running)
- Filter 'All' menampilkan semua session
- Empty state muncul saat filter aktif tapi tidak ada session
- UI konsisten dengan design system yang ada (warna, rounded corners, spacing)
- Responsive di mobile (2 kolom grid untuk stats row)

---

## Out of Scope (Future)

- URL persistence (`?strategy=grid`)
- Filter berdasarkan mode atau status
- Search bar untuk nama session
- Sort by (date created, name, P&L)
