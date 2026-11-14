export const UI_DESIGNS_STORAGE_KEY = 'waraqa-ui-designs'

export function readUiDesigns() {
  try {
    const saved = JSON.parse(localStorage.getItem(UI_DESIGNS_STORAGE_KEY) || '[]')
    if (!Array.isArray(saved)) return []
    return saved.filter((design) => design && typeof design.id === 'string' && typeof design.workspaceId === 'string')
      .map((design) => ({
        ...design,
        title: typeof design.title === 'string' ? design.title : 'واجهة جديدة',
        screens: Array.isArray(design.screens) ? design.screens.map((screen) => ({
          ...screen,
          title: typeof screen.title === 'string' ? screen.title : 'شاشة جديدة',
          width: Number.isFinite(screen.width) ? Math.max(240, Math.min(2560, screen.width)) : 390,
          height: Number.isFinite(screen.height) ? Math.max(320, screen.height) : 844,
          scrollLengthPercent: Number.isFinite(screen.scrollLengthPercent) ? Math.max(100, Math.min(10000, screen.scrollLengthPercent)) : 100,
          background: typeof screen.background === 'string' ? screen.background : '#ffffff',
          components: Array.isArray(screen.components) ? screen.components : [],
        })) : [],
        updatedAt: Number.isFinite(design.updatedAt) ? design.updatedAt : Date.now(),
      }))
  } catch (error) {
    console.error('Could not read saved interface designs.', error)
    return []
  }
}
