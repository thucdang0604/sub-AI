import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useIntegrationStore = defineStore('integration', () => {
  // Settings & Providers
  const openAIKey = ref('')
  const geminiKey = ref('')
  const activeModel = ref('')
  
  // Knowledge Base & Hardware
  const searchQuery = ref('')
  const searchResults = ref<any[]>([])
  const isSearching = ref(false)
  const hardwareMetrics = ref<any>(null)
  const activityLogs = ref<any[]>([])
  const activityProgress = ref<any>(null)
  const indexStatus = ref<{ isIndexed: boolean; chunkCount: number; lastUpdated: string | null } | null>(null)

  // AI Audit 
  const isAuditing = ref(false)
  const auditResult = ref('')

  // Git & GitHub
  const gitRecentChanges = ref<any[]>([])
  const isLoadingGit = ref(false)
  const githubUrl = ref('')
  const githubSync = ref<any>(null)
  const isLoadingSync = ref(false)
  const githubToken = ref('')
  const hasGithubToken = ref(false)
  const issuePreview = ref<any[]>([])
  const showIssuePreview = ref(false)
  const isCreatingIssues = ref(false)
  const issueCreateResult = ref<any>(null)

  // Guide
  const guideContent = ref('')
  const isLoadingGuide = ref(false)

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings')
      if (res.ok) {
        const data = await res.json()
        openAIKey.value = data.OPENAI_API_KEY || ''
        geminiKey.value = data.GEMINI_API_KEY || ''
        githubToken.value = data.GITHUB_TOKEN || ''
        hasGithubToken.value = !!data.GITHUB_TOKEN
        if (data.AI_MODEL) {
          activeModel.value = data.AI_MODEL
        }
      }
    } catch (e) {
      console.error('Failed to load settings', e)
    }
  }

  const saveSettings = async () => {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          OPENAI_API_KEY: openAIKey.value,
          GEMINI_API_KEY: geminiKey.value,
          GITHUB_TOKEN: githubToken.value,
          AI_MODEL: activeModel.value
        })
      })
      if (res.ok) {
        alert('Settings saved successfully!')
        hasGithubToken.value = !!githubToken.value
      }
    } catch (e) {
      console.error('Failed to save settings', e)
      alert('Failed to save settings')
    }
  }

  const fetchHardware = async () => {
    try {
      const res = await fetch('/api/hardware')
      if (res.ok) hardwareMetrics.value = await res.json()
    } catch (e) {}
  }

  const fetchIndexStatus = async (targetDir: string) => {
    if (!targetDir) return;
    try {
      const res = await fetch('/api/rag/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDir })
      })
      if (res.ok) {
        indexStatus.value = await res.json()
      } else {
        indexStatus.value = null
      }
    } catch(e) {
      indexStatus.value = null
    }
  }

  const setupSSE = () => {
    const source = new EventSource('/api/events')
    source.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'log') {
          activityLogs.value.push(data)
          if (activityLogs.value.length > 100) activityLogs.value.shift()
        } else if (data.type === 'progress') {
          activityProgress.value = data
        }
      } catch(err) {}
    }
  }

  const handleSearchKnowledge = async (targetDir: string) => {
    if (!targetDir || !searchQuery.value) return;
    isSearching.value = true;
    try {
      const res = await fetch('/api/rag/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDir, query: searchQuery.value, limit: 5 })
      });
      if (res.ok) {
        const data = await res.json();
        searchResults.value = data.results || [];
      }
    } catch(e) {
      console.error(e);
    } finally {
      isSearching.value = false;
    }
  }

  const handleIndexKnowledge = async (targetDir: string) => {
    if (!targetDir) {
      alert('Vui lòng phân tích dự án trước khi tạo Index.');
      return;
    }
    activityLogs.value = [];
    activityProgress.value = null;
    try {
      const res = await fetch('/api/rag/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDir, model: activeModel.value })
      });
      if (res.ok) {
        alert('Đã gửi yêu cầu tạo chỉ mục (Index). Xem tiến trình ở tab Knowledge Base.');
      } else {
        const err = await res.json();
        alert('Lỗi: ' + err.error);
      }
    } catch(e: any) {
      console.error(e);
      alert('Lỗi: ' + e.message);
    }
  }

  const handleAuditRecommend = async () => {
    if (!activeModel.value) {
      alert('Vui lòng chọn AI model trước.')
      return
    }
    isAuditing.value = true
    auditResult.value = ''
    try {
      const res = await fetch('/api/audit/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: activeModel.value })
      })
      if (res.ok && res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.substring(6).trim()
              if (dataStr) {
                try {
                  const parsed = JSON.parse(dataStr)
                  if (parsed.text) auditResult.value += parsed.text
                } catch (_) {}
              }
            }
          }
        }
      } else {
        auditResult.value = 'Lỗi kết nối tới server AI.'
      }
    } catch (e: any) {
      console.error(e)
      auditResult.value = 'Lỗi: ' + e.message
    } finally {
      isAuditing.value = false
    }
  }

  const loadGuideContent = async () => {
    if (guideContent.value) return 
    isLoadingGuide.value = true
    try {
      const res = await fetch('/api/guide')
      if (res.ok) {
        const data = await res.json()
        guideContent.value = data.content || ''
      }
    } catch (e) {
      guideContent.value = '# Không thể tải hướng dẫn\nVui lòng thử lại.'
    } finally {
      isLoadingGuide.value = false
    }
  }

  return {
    openAIKey,
    geminiKey,
    activeModel,
    searchQuery,
    searchResults,
    isSearching,
    hardwareMetrics,
    activityLogs,
    activityProgress,
    indexStatus,
    isAuditing,
    auditResult,
    gitRecentChanges,
    isLoadingGit,
    githubUrl,
    githubSync,
    isLoadingSync,
    githubToken,
    hasGithubToken,
    issuePreview,
    showIssuePreview,
    isCreatingIssues,
    issueCreateResult,
    guideContent,
    isLoadingGuide,
    fetchSettings,
    saveSettings,
    fetchHardware,
    fetchIndexStatus,
    setupSSE,
    handleSearchKnowledge,
    handleIndexKnowledge,
    handleAuditRecommend,
    loadGuideContent
  }
})
