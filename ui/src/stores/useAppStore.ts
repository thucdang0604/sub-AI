import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStore = defineStore('app', () => {
  const activeTab = ref<'chat' | 'settings' | 'features' | 'health' | 'knowledge' | 'guide'>('chat')
  const sidebarWidth = ref(400)
  const isResizing = ref(false)
  const recentProjects = ref<string[]>([])
  const showProjectDropdown = ref(false)
  
  const SIDEBAR_WIDTH_KEY = 'sub-ai-sidebar-width'
  const MIN_SIDEBAR_WIDTH = 300
  const MAX_SIDEBAR_WIDTH = 800
  const RECENT_PROJECTS_KEY = 'sub-ai-recent-projects'
  const MAX_RECENT = 10

  const loadSidebarWidth = () => {
    try {
      const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY)
      if (saved) sidebarWidth.value = parseInt(saved, 10)
    } catch (_) {}
  }

  const saveSidebarWidth = () => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.value.toString())
  }

  const handleResizing = (e: MouseEvent) => {
    if (!isResizing.value) return
    const newWidth = window.innerWidth - e.clientX
    if (newWidth >= MIN_SIDEBAR_WIDTH && newWidth <= MAX_SIDEBAR_WIDTH) {
      sidebarWidth.value = newWidth
    }
  }

  const startResizing = () => {
    isResizing.value = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', handleResizing)
    window.addEventListener('mouseup', stopResizing)
  }

  const stopResizing = () => {
    isResizing.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('mousemove', handleResizing)
    window.removeEventListener('mouseup', stopResizing)
    saveSidebarWidth()
  }

  const loadRecentProjects = () => {
    try {
      const raw = localStorage.getItem(RECENT_PROJECTS_KEY)
      if (raw) recentProjects.value = JSON.parse(raw)
    } catch (_) {}
  }

  const saveRecentProject = (dir: string) => {
    const list = recentProjects.value.filter(p => p !== dir)
    list.unshift(dir)
    recentProjects.value = list.slice(0, MAX_RECENT)
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(recentProjects.value))
  }

  const removeRecentProject = (dir: string) => {
    recentProjects.value = recentProjects.value.filter(p => p !== dir)
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(recentProjects.value))
  }

  return {
    activeTab,
    sidebarWidth,
    isResizing,
    recentProjects,
    showProjectDropdown,
    loadSidebarWidth,
    startResizing,
    loadRecentProjects,
    saveRecentProject,
    removeRecentProject
  }
})
