import { create } from 'zustand'

// Discrete game state only. Per-frame hot data (positions, headings) lives in
// the mutable `world` object so it never churns React.

export type Phase = 'loading' | 'playing' | 'ended'

interface GameStore {
  phase: Phase
  legendVisible: boolean
  chapterTitle: string
  setPhase: (p: Phase) => void
  setChapterTitle: (t: string) => void
  dismissLegend: () => void
  endChapter: () => void
}

export const useGame = create<GameStore>((set) => ({
  phase: 'loading',
  legendVisible: false,
  chapterTitle: '',
  setPhase: (phase) => set({ phase }),
  setChapterTitle: (chapterTitle) => set({ chapterTitle }),
  dismissLegend: () => set({ legendVisible: false }),
  endChapter: () => set((s) => (s.phase === 'ended' ? s : { phase: 'ended' })),
}))
