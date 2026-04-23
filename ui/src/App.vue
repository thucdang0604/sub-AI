<script setup lang="ts">
import { ref, onMounted, nextTick, computed } from 'vue'
import { Settings, MessageSquare, Maximize2, History, Plus, Trash2, FolderOpen, ChevronDown, Camera, Download, Database, Activity, Search, GitCommit } from 'lucide-vue-next'
import { marked } from 'marked'
import Graph from './components/Graph.vue'

const activeTab = ref<'chat' | 'settings' | 'features' | 'health' | 'knowledge' | 'guide'>('chat')
const chatInput = ref('')
const graphData = ref<any>(null)
const selectedNodes = ref<any[]>([])
const chatMessagesRef = ref<HTMLElement | null>(null)
const targetDir = ref('')
const isAnalyzing = ref(false)
const aiReferencedNodes = ref<string[]>([])

// Features and Health state
const featuresMarkdown = ref('')
const isEvaluatingFeatures = ref(false)
const healthSearch = ref('')
const layoutMode = ref<'force' | 'architecture' | 'features'>('force')
const isAnalyzingFeature = ref<string | null>(null)
const featureAnalysisResults = ref<Record<string, string>>({})
const graphRef = ref<any>(null)

// Physics Config
const physicsConfig = ref({
  featureSpacing: 800,
  clusterGravity: 0.8,
  repulsion: -500,
  linkDistance: 150
})

// Export functionality
const exportGraphImage = () => {
  if (graphRef.value) {
    graphRef.value.exportToPNG()
  }
}

const exportMarkdownReport = () => {
  if (!featuresMarkdown.value) return;
  const blob = new Blob([featuresMarkdown.value], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'architecture_report.md';
  a.click();
}

// Knowledge Base & Hardware
const searchQuery = ref('')
const searchResults = ref<any[]>([])
const isSearching = ref(false)
const hardwareMetrics = ref<any>(null)
const activityLogs = ref<any[]>([])
const activityProgress = ref<any>(null)

// AI Audit Recommendation
const isAuditing = ref(false)
const auditResult = ref('')

// Health Report from API
const healthReport = ref<any>(null)
const isLoadingHealth = ref(false)

// Git Recent Changes
const gitRecentChanges = ref<any[]>([])
const isLoadingGit = ref(false)

// Guide Tab
const guideContent = ref('')
const isLoadingGuide = ref(false)

const fetchHardware = async () => {
  try {
    const res = await fetch('/api/hardware')
    if (res.ok) hardwareMetrics.value = await res.json()
  } catch (e) {}
}

const indexStatus = ref<{ isIndexed: boolean; chunkCount: number; lastUpdated: string | null } | null>(null)

const fetchIndexStatus = async () => {
  if (!targetDir.value) return;
  try {
    const res = await fetch('/api/rag/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDir: targetDir.value })
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

const handleSearchKnowledge = async () => {
  if (!targetDir.value || !searchQuery.value) return;
  isSearching.value = true;
  try {
    const res = await fetch('/api/rag/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDir: targetDir.value, query: searchQuery.value, limit: 5 })
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

const handleIndexKnowledge = async () => {
  if (!targetDir.value) {
    alert('Vui lòng phân tích dự án trước khi tạo Index.');
    return;
  }
  activityLogs.value = [];
  activityProgress.value = null;
  try {
    const res = await fetch('/api/rag/index', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDir: targetDir.value, model: activeModel.value })
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

// --- AI Audit Recommendation ---
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

// --- Guide Tab ---
const loadGuideContent = async () => {
  if (guideContent.value) return // already loaded
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

// Chat History state
const chatSessions = ref<any[]>([])
const currentSessionId = ref('')
const showHistoryPanel = ref(false)

// Recent Projects state
const recentProjects = ref<string[]>([])
const showProjectDropdown = ref(false)
const RECENT_PROJECTS_KEY = 'sub-ai-recent-projects'
const MAX_RECENT = 10

// Resizable Sidebar state
const sidebarWidth = ref(400)
const isResizing = ref(false)
const MIN_SIDEBAR_WIDTH = 300
const MAX_SIDEBAR_WIDTH = 800
const SIDEBAR_WIDTH_KEY = 'sub-ai-sidebar-width'

const scrollToBottom = async () => {
  await nextTick()
  if (chatMessagesRef.value) {
    chatMessagesRef.value.scrollTop = chatMessagesRef.value.scrollHeight
  }
}

// Fetch graph data
const fetchGraph = async () => {
  try {
    const res = await fetch('/dependency-graph.json')
    if (res.ok) {
      graphData.value = await res.json()
      if (graphData.value?.projectRoot) {
        targetDir.value = graphData.value.projectRoot
        await fetchIndexStatus()
      }
    } else {
      graphData.value = null
    }
  } catch (e) {
    console.error('Failed to load graph data', e)
  }
}

// --- Sidebar Resizing ---
const loadSidebarWidth = () => {
  try {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY)
    if (saved) sidebarWidth.value = parseInt(saved, 10)
  } catch (_) {}
}

const saveSidebarWidth = () => {
  localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.value.toString())
}

const startResizing = () => {
  isResizing.value = true
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('mousemove', handleResizing)
  window.addEventListener('mouseup', stopResizing)
}

const handleResizing = (e: MouseEvent) => {
  if (!isResizing.value) return
  // Calculate new width: window width - mouse X position (since sidebar is on the right)
  const newWidth = window.innerWidth - e.clientX
  if (newWidth >= MIN_SIDEBAR_WIDTH && newWidth <= MAX_SIDEBAR_WIDTH) {
    sidebarWidth.value = newWidth
  }
}

const stopResizing = () => {
  isResizing.value = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  window.removeEventListener('mousemove', handleResizing)
  window.removeEventListener('mouseup', stopResizing)
  saveSidebarWidth()
}

// --- Recent Projects ---
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

const selectRecentProject = async (dir: string) => {
  targetDir.value = dir
  showProjectDropdown.value = false
  await handleAnalyze()
}

const removeRecentProject = (dir: string, event: Event) => {
  event.stopPropagation()
  recentProjects.value = recentProjects.value.filter(p => p !== dir)
  localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(recentProjects.value))
}

const handleNodeClick = ({ node, shiftKey }: { node: any, shiftKey: boolean }) => {
  if (shiftKey) {
    const exists = selectedNodes.value.find(n => n.id === node.id)
    if (exists) {
      selectedNodes.value = selectedNodes.value.filter(n => n.id !== node.id)
    } else {
      selectedNodes.value = [...selectedNodes.value, node]
    }
  } else {
    selectedNodes.value = [node]
  }
}

const handleAnalyze = async () => {
  if (!targetDir.value.trim()) return
  isAnalyzing.value = true
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDir: targetDir.value.trim() })
    })
    if (res.ok) {
      await fetchGraph()
      await fetchIndexStatus()
      saveRecentProject(targetDir.value.trim())
      aiReferencedNodes.value = []
      selectedNodes.value = []
    } else {
      const err = await res.json()
      alert('Analysis failed: ' + err.error)
    }
  } catch (e) {
    console.error('Failed to analyze', e)
    alert('Analysis failed')
  } finally {
    isAnalyzing.value = false
  }
}

const updateAIHighlights = (text: string) => {
  if (!graphData.value?.nodes) return
  const found = new Set(aiReferencedNodes.value)
  for (const node of graphData.value.nodes) {
    const basename = node.id.split('/').pop()
    if (text.includes(node.id) || (basename && text.includes(`\`${basename}\``))) {
      found.add(node.id)
    }
  }
  aiReferencedNodes.value = Array.from(found)
}

// Parse a stream data string that may contain one or more concatenated JSON objects
// e.g. '{"text":"##"}{"text":" "}{"text":"📊"}'
const parseStreamData = (dataStr: string): { text: string, error: string | null } => {
  let text = ''
  let error: string | null = null

  // Try single JSON parse first (fast path)
  try {
    const payload = JSON.parse(dataStr)
    if (payload.error) return { text: '', error: payload.error }
    if (payload.text !== undefined) return { text: payload.text, error: null }
    return { text: '', error: null }
  } catch (_) {
    // Not a single valid JSON — try extracting multiple concatenated JSON objects
  }

  // Match all top-level JSON objects in the string
  const jsonRegex = /\{[^{}]*\}/g
  let match: RegExpExecArray | null
  let found = false
  while ((match = jsonRegex.exec(dataStr)) !== null) {
    try {
      const obj = JSON.parse(match[0])
      found = true
      if (obj.error) {
        error = obj.error
      } else if (obj.text !== undefined) {
        text += obj.text
      }
    } catch (_) {
      // skip malformed fragment
    }
  }

  // If no JSON objects found at all, treat the whole string as plain text
  if (!found) {
    text = dataStr
  }

  return { text, error }
}

const selectedNodeStats = computed(() => {
  if (selectedNodes.value.length !== 1 || !graphData.value) return null
  
  const id = selectedNodes.value[0].id
  let imports = 0
  let importedBy = 0
  
  const edges = graphData.value.edges || graphData.value.links || []
  for (const link of edges) {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source
    const targetId = typeof link.target === 'object' ? link.target.id : link.target
    
    if (sourceId === id) imports++
    if (targetId === id) importedBy++
  }
  
  return { imports, importedBy, lines: selectedNodes.value[0].lines || 0, category: selectedNodes.value[0].category || 'Unknown' }
})

// Blast Radius Computed
const getBlastRadius = (startId: string) => {
  if (!graphData.value) return 0
  const edges = graphData.value.edges || graphData.value.links || []
  const importedByMap: Record<string, string[]> = {}
  for (const link of edges) {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source
    const targetId = typeof link.target === 'object' ? link.target.id : link.target
    if (!importedByMap[targetId]) importedByMap[targetId] = []
    importedByMap[targetId].push(sourceId)
  }
  
  const visited = new Set<string>()
  const queue = [startId]
  while (queue.length > 0) {
    const curr = queue.shift()!
    if (!visited.has(curr)) {
      visited.add(curr)
      const importers = importedByMap[curr] || []
      for (const imp of importers) {
        if (!visited.has(imp)) queue.push(imp)
      }
    }
  }
  // Exclude the starting node itself
  return visited.size > 0 ? visited.size - 1 : 0
}

const highlightBlastRadius = () => {
  if (selectedNodes.value.length !== 1 || !graphData.value) return
  
  const startId = selectedNodes.value[0].id
  const edges = graphData.value.edges || graphData.value.links || []
  const importedByMap: Record<string, string[]> = {}
  
  for (const link of edges) {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source
    const targetId = typeof link.target === 'object' ? link.target.id : link.target
    if (!importedByMap[targetId]) importedByMap[targetId] = []
    importedByMap[targetId].push(sourceId)
  }
  
  const visited = new Set<string>()
  const queue = [startId]
  while (queue.length > 0) {
    const curr = queue.shift()!
    if (!visited.has(curr)) {
      visited.add(curr)
      const importers = importedByMap[curr] || []
      for (const imp of importers) {
        if (!visited.has(imp)) queue.push(imp)
      }
    }
  }
  
  aiReferencedNodes.value = Array.from(visited)
}

const handleAction = async (action: 'summarize' | 'impact' | 'what-to-edit' | 'evaluate-features' | 'analyze-feature' | 'audit', featureId?: string) => {
  if (selectedNodes.value.length === 0 && action !== 'what-to-edit' && action !== 'evaluate-features' && action !== 'analyze-feature') return
  if (!activeModel.value) {
    alert('Please select an AI model first.')
    return
  }
  
  if (action === 'evaluate-features') {
    const confirmed = confirm('Đánh giá tính năng sẽ gửi sơ đồ của toàn bộ dự án lên AI để phân tích. Cần đảm bảo model bạn chọn (ví dụ gemma, llama3) hỗ trợ ngữ cảnh dài. Bạn có muốn tiếp tục?');
    if (!confirmed) return;
    isEvaluatingFeatures.value = true;
    featuresMarkdown.value = '';
    
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'evaluate-features',
          model: activeModel.value
        })
      });
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.substring(6).trim();
              if (dataStr) {
                const parsed = parseStreamData(dataStr);
                if (parsed.text) featuresMarkdown.value += parsed.text;
              }
            }
          }
        }
      }
    } catch (e) {
      console.error(e);
      featuresMarkdown.value = 'Lỗi phân tích tính năng.';
    } finally {
      isEvaluatingFeatures.value = false;
    }
    return;
  }

  if (action === 'analyze-feature' && featureId) {
    isAnalyzingFeature.value = featureId;
    featureAnalysisResults.value[featureId] = '';
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyze-feature',
          model: activeModel.value,
          featureId: featureId
        })
      });
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.substring(6).trim();
              if (dataStr) {
                const parsed = parseStreamData(dataStr);
                if (parsed.text) featureAnalysisResults.value[featureId] += parsed.text;
              }
            }
          }
        }
      }
    } catch (e) {
      console.error(e);
      featureAnalysisResults.value[featureId] = 'Lỗi phân tích.';
    } finally {
      isAnalyzingFeature.value = null;
    }
    return;
  }
  
  isChatLoading.value = true
  
  let userMsg = ''
  const fileIds = selectedNodes.value.map(n => n.id)
  if (action === 'summarize') userMsg = `Summarize ${fileIds.join(', ')}`
  if (action === 'impact') userMsg = `Impact analysis for ${fileIds.join(', ')}`
  if (action === 'what-to-edit') userMsg = `Analyze what to edit for: ${chatInput.value}`
  if (action === 'audit') userMsg = `Perform deep security and logic audit for ${fileIds.join(', ')}`
  
  chatMessages.value.push({ role: 'user', content: userMsg })
  chatMessages.value.push({ role: 'assistant', content: '' })
  aiReferencedNodes.value = []
  
  activeTab.value = 'chat'
  showHistoryPanel.value = false

  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        model: activeModel.value,
        fileIds,
        prompt: chatInput.value
      })
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
              const parsed = parseStreamData(dataStr)
              if (parsed.error) {
                chatMessages.value[chatMessages.value.length - 1].content += `\n**Error:** ${parsed.error}`
              } else if (parsed.text) {
                chatMessages.value[chatMessages.value.length - 1].content += parsed.text
              }
              updateAIHighlights(chatMessages.value[chatMessages.value.length - 1].content)
              scrollToBottom()
            }
          }
        }
      }
    } else {
      chatMessages.value[chatMessages.value.length - 1].content = 'Error connecting to the AI server.'
      scrollToBottom()
    }
  } catch (e) {
    console.error('Chat error', e)
    chatMessages.value[chatMessages.value.length - 1].content = 'Failed to execute action.'
  } finally {
    isChatLoading.value = false
    await saveCurrentSession()
  }
}

const models = ref<any[]>([])
const activeModel = ref('')
const openAIKey = ref('')
const geminiKey = ref('')
const isChatLoading = ref(false)
const chatMessages = ref<{role: string, content: string}[]>([
  { role: 'assistant', content: 'Hello! I am ready to help you analyze this codebase. Ask me anything.' }
])

// --- Chat History CRUD ---
const generateSessionId = () => `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

const getSessionTitle = (messages: {role: string, content: string}[]) => {
  const firstUser = messages.find(m => m.role === 'user')
  if (!firstUser) return 'New Chat'
  return firstUser.content.slice(0, 60) + (firstUser.content.length > 60 ? '...' : '')
}

const fetchChatSessions = async () => {
  try {
    const res = await fetch('/api/ai/history')
    if (res.ok) {
      const data = await res.json()
      chatSessions.value = (data.sessions || []).sort((a: any, b: any) => 
        new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
      )
    }
  } catch (e) {
    console.error('Failed to fetch chat sessions', e)
  }
}

const saveCurrentSession = async () => {
  // Don't save if only the welcome message
  if (chatMessages.value.length <= 1) return
  
  if (!currentSessionId.value) {
    currentSessionId.value = generateSessionId()
  }

  try {
    await fetch('/api/ai/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: currentSessionId.value,
        title: getSessionTitle(chatMessages.value),
        messages: chatMessages.value
      })
    })
    await fetchChatSessions()
  } catch (e) {
    console.error('Failed to save session', e)
  }
}

const loadSession = async (session: any) => {
  try {
    const res = await fetch(`/api/ai/history/${session.id}`)
    if (res.ok) {
      const data = await res.json()
      chatMessages.value = data.messages || []
      currentSessionId.value = session.id
      showHistoryPanel.value = false
      activeTab.value = 'chat'
      await scrollToBottom()
    }
  } catch (e) {
    console.error('Failed to load session', e)
  }
}

const deleteSession = async (id: string, event: Event) => {
  event.stopPropagation()
  try {
    await fetch(`/api/ai/history/${id}`, { method: 'DELETE' })
    chatSessions.value = chatSessions.value.filter(s => s.id !== id)
    if (currentSessionId.value === id) {
      newChatSession()
    }
  } catch (e) {
    console.error('Failed to delete session', e)
  }
}

const newChatSession = () => {
  currentSessionId.value = ''
  chatMessages.value = [
    { role: 'assistant', content: 'Hello! I am ready to help you analyze this codebase. Ask me anything.' }
  ]
  showHistoryPanel.value = false
  aiReferencedNodes.value = []
}

const fetchSettings = async () => {
  try {
    const res = await fetch('/api/settings')
    if (res.ok) {
      const data = await res.json()
      openAIKey.value = data.OPENAI_API_KEY || ''
      geminiKey.value = data.GEMINI_API_KEY || ''
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
        AI_MODEL: activeModel.value
      })
    })
    if (res.ok) {
      alert('Settings saved successfully!')
    }
  } catch (e) {
    console.error('Failed to save settings', e)
    alert('Failed to save settings')
  }
}

const fetchModels = async () => {
  try {
    const res = await fetch('/api/ai/models')
    if (res.ok) {
      const data = await res.json()
      models.value = data.models || []
      if (models.value.length > 0) {
        activeModel.value = models.value[0].id
      }
    }
  } catch (e) {
    console.error('Failed to load models', e)
  }
}

const fetchHealthReport = async () => {
  isLoadingHealth.value = true
  try {
    const res = await fetch('/api/health')
    if (res.ok) {
      healthReport.value = await res.json()
    }
  } catch (e) {
    console.error('Failed to fetch health report', e)
  } finally {
    isLoadingHealth.value = false
  }
}

const fetchGitRecent = async () => {
  if (!targetDir.value) return
  isLoadingGit.value = true
  try {
    const res = await fetch('/api/git/recent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDir: targetDir.value, limit: 8 })
    })
    if (res.ok) {
      gitRecentChanges.value = await res.json()
    }
  } catch (e) {
    console.error('Failed to fetch git changes', e)
  } finally {
    isLoadingGit.value = false
  }
}

const healthScoreColor = (score: number) => {
  if (score >= 80) return '#10b981'
  if (score >= 50) return '#f59e0b'
  return '#ef4444'
}

onMounted(() => {
  loadSidebarWidth()
  loadRecentProjects()
  fetchGraph().then(() => {
    fetchHealthReport()
    fetchGitRecent()
  })
  fetchModels().then(() => fetchSettings())
  fetchChatSessions()
  fetchHardware()
  setInterval(fetchHardware, 5000)
  setupSSE()
})

const sendMessage = async () => {
  if (!chatInput.value.trim() || isChatLoading.value || !activeModel.value) return
  
  const userMessage = chatInput.value
  chatInput.value = ''
  chatMessages.value.push({ role: 'user', content: userMessage })
  isChatLoading.value = true

  // Add a temporary empty assistant message
  chatMessages.value.push({ role: 'assistant', content: '' })
  aiReferencedNodes.value = []

  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'chat',
        prompt: userMessage,
        model: activeModel.value
      })
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
              const parsed = parseStreamData(dataStr)
              if (parsed.error) {
                chatMessages.value[chatMessages.value.length - 1].content += `\n**Error:** ${parsed.error}`
              } else if (parsed.text) {
                chatMessages.value[chatMessages.value.length - 1].content += parsed.text
              }
              updateAIHighlights(chatMessages.value[chatMessages.value.length - 1].content)
              scrollToBottom()
            }
          }
        }
      }
    } else {
      chatMessages.value[chatMessages.value.length - 1].content = 'Error connecting to the AI server.'
      scrollToBottom()
    }
  } catch (e) {
    console.error('Chat error', e)
    chatMessages.value[chatMessages.value.length - 1].content = 'Failed to send message.'
  } finally {
    isChatLoading.value = false
    await saveCurrentSession()
  }
}
</script>

<template>
  <div class="layout">
    <!-- Main Content Area (Graph) -->
    <main class="graph-container">
      <div class="graph-header">
        <div class="project-selector">
          <div class="project-input-wrapper">
            <input type="text" v-model="targetDir" placeholder="Nhập đường dẫn tuyệt đối của dự án..." :disabled="isAnalyzing" @keyup.enter="handleAnalyze" />
            <button v-if="recentProjects.length > 0" class="btn-dropdown" @click="showProjectDropdown = !showProjectDropdown" title="Dự án gần đây">
              <ChevronDown :size="16" />
            </button>
            <!-- Recent Projects Dropdown -->
            <div class="recent-dropdown" v-if="showProjectDropdown && recentProjects.length > 0">
              <div class="recent-dropdown-header">Dự án gần đây</div>
              <div class="recent-item" v-for="proj in recentProjects" :key="proj" @click="selectRecentProject(proj)">
                <FolderOpen :size="14" />
                <span class="recent-path">{{ proj }}</span>
                <button class="btn-remove" @click="removeRecentProject(proj, $event)" title="Xoá">
                  <Trash2 :size="12" />
                </button>
              </div>
            </div>
          </div>
          <button class="btn-primary" @click="handleAnalyze" :disabled="isAnalyzing">
            {{ isAnalyzing ? 'Đang phân tích...' : 'Phân tích' }}
          </button>
        </div>
        <button class="btn-icon btn-layout-toggle" title="Đổi giao diện" @click="layoutMode = layoutMode === 'force' ? 'architecture' : (layoutMode === 'architecture' ? 'features' : 'force')">
          {{ layoutMode === 'force' ? '🌐' : (layoutMode === 'architecture' ? '🏗️' : '📦') }}
        </button>
        <button class="btn-icon" title="Xuất ảnh đồ thị" @click="exportGraphImage">
          <Camera :size="20" />
        </button>
        <button class="btn-icon" title="Toàn màn hình">
          <Maximize2 :size="20" />
        </button>
      </div>
      <div class="graph-content" id="d3-container">
        <Graph ref="graphRef" v-if="graphData" :data="graphData" :selectedNodeIds="selectedNodes.map(n=>n.id)" :aiReferencedNodes="aiReferencedNodes" :layoutMode="layoutMode" :physicsConfig="physicsConfig" @node-click="handleNodeClick" />
        <div v-else class="placeholder-text">
          <div style="text-align: center; max-width: 400px; padding: 2rem;">
            <h2 style="color: white; margin-bottom: 1rem;">Chưa tải dự án nào</h2>
            <p>Vui lòng nhập đường dẫn tuyệt đối của thư mục dự án ở trên và nhấn Phân tích để bắt đầu.</p>
          </div>
        </div>
      </div>
      
      <!-- Graph Legend -->
      <div class="legend-panel glass-panel" v-if="graphData">
        <h4>Chú giải</h4>
        <div class="legend-item">
          <span class="legend-color" style="background: #00ff00"></span> Node đang chọn
        </div>
        <div class="legend-item">
          <span class="legend-color" style="border: 2px solid #00ffff; background: transparent;"></span> AI Đánh dấu
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #ff0000; height: 3px; width: 12px; border-radius: 0;"></span> Liên kết đi (Import)
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #00ff00; height: 3px; width: 12px; border-radius: 0;"></span> Liên kết đến (Được Import)
        </div>
      <div class="legend-item">
          <span class="legend-color" style="border: 3px solid #ff4444; background: transparent;"></span> ⚠ Cảnh báo nghiêm trọng
        </div>
        <div class="legend-item">
          <span class="legend-color" style="border: 3px solid #ffaa00; background: transparent;"></span> ⚡ Cảnh báo trung bình
        </div>
        <div class="legend-item">
          <span class="legend-color" style="border: 2px dashed #888; background: rgba(255,255,255,0.1);"></span> File mồ côi (Orphan)
        </div>
        <div class="legend-note">Kích thước Node = số dòng code</div>
        <div class="legend-item">
          <span class="legend-color" style="border: 2px dashed #00ffff; background: transparent;"></span> Luồng phân tích AI
        </div>
        <div class="legend-note" v-if="layoutMode === 'architecture'" style="color: #a78bfa">🏗️ Chế độ kiến trúc đang bật</div>
        <div class="legend-note" v-else-if="layoutMode === 'features'" style="color: #f472b6">📦 Chế độ tính năng đang bật</div>
      </div>
      
      <!-- Selected Node Panel -->
      <div v-if="selectedNodes.length > 0" class="node-panel glass-panel">
        <div class="node-panel-header">
          <h3 :title="selectedNodes.length === 1 ? selectedNodes[0].id : 'Multiple Files'">
            {{ selectedNodes.length === 1 ? selectedNodes[0].id.split('/').pop() : `Đã chọn ${selectedNodes.length} files` }}
          </h3>
          <button class="btn-icon" @click="selectedNodes = []">x</button>
        </div>
        <p v-if="selectedNodes.length === 1" class="node-panel-path">{{ selectedNodes[0].id }}</p>
        
        <div class="node-stats" v-if="selectedNodeStats && selectedNodes.length === 1">
          <div class="stat-box">
            <span class="stat-value">{{ selectedNodeStats.lines }}</span>
            <span class="stat-label">Số dòng</span>
          </div>
          <div class="stat-box">
            <span class="stat-value">{{ selectedNodeStats.imports }}</span>
            <span class="stat-label">Imports</span>
          </div>
          <div class="stat-box">
            <span class="stat-value">{{ selectedNodeStats.importedBy }}</span>
            <span class="stat-label">Dùng bởi</span>
          </div>
          <div class="stat-box" style="background: rgba(239, 68, 68, 0.2);" title="Mức độ ảnh hưởng dây chuyền (Blast Radius)">
            <span class="stat-value" style="color: #ef4444">{{ getBlastRadius(selectedNodes[0].id) }}</span>
            <span class="stat-label">Ảnh hưởng</span>
          </div>
          <div class="stat-box" v-if="selectedNodes[0].gitChanges">
            <span class="stat-value">{{ selectedNodes[0].gitChanges }}</span>
            <span class="stat-label">Commits</span>
          </div>
        </div>

        <div class="node-panel-docs" v-if="selectedNodes.length === 1 && selectedNodes[0].docs && selectedNodes[0].docs.length > 0" style="margin-bottom: 1rem;">
          <h4 style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem; font-weight: 600;">Tài liệu liên quan</h4>
          <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.8rem;">
            <li v-for="doc in selectedNodes[0].docs" :key="doc" style="margin-bottom: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <a :href="doc" target="_blank" style="color: #60a5fa; text-decoration: none;" :title="doc">🔗 {{ doc }}</a>
            </li>
          </ul>
        </div>

        <div class="node-panel-actions">
          <button class="btn-secondary btn-sm" @click="handleAction('summarize')" :disabled="isChatLoading">Tóm tắt</button>
          <button class="btn-secondary btn-sm" @click="handleAction('impact')" :disabled="isChatLoading">Ảnh hưởng</button>
          <button class="btn-primary btn-sm" @click="handleAction('audit')" :disabled="isChatLoading" title="Kiểm tra sâu (Audit)">{{ isChatLoading ? '⏳ Đang Audit...' : 'AI Audit' }}</button>
        </div>
        <div class="node-panel-actions">
          <button class="btn-secondary w-full" @click="highlightBlastRadius" v-if="selectedNodes.length === 1">Đánh dấu đường dẫn</button>
        </div>
      </div>
    </main>

    <!-- Resizer Handle -->
    <div 
      class="sidebar-resizer" 
      @mousedown="startResizing" 
      :class="{ active: isResizing }"
      title="Kéo để đổi kích thước"
    ></div>

    <!-- Sidebar -->
    <aside class="sidebar glass-panel" :style="{ width: sidebarWidth + 'px' }">
      <header class="sidebar-header">
        <div class="tabs">
          <button class="tab" :class="{ active: activeTab === 'chat' }" @click="activeTab = 'chat'; showHistoryPanel = false">
            <MessageSquare :size="16" />
            <span>Trò chuyện</span>
          </button>
          <button class="tab" :class="{ active: activeTab === 'knowledge' }" @click="activeTab = 'knowledge'">
            <Database :size="16" />
            <span>RAG</span>
          </button>
          <button class="tab" :class="{ active: activeTab === 'features' }" @click="activeTab = 'features'">
            <span>Tính năng</span>
          </button>
          <button class="tab" :class="{ active: activeTab === 'health' }" @click="activeTab = 'health'">
            <span>Sức khoẻ</span>
          </button>
          <button class="tab" :class="{ active: activeTab === 'settings' }" @click="activeTab = 'settings'">
            <Settings :size="16" />
          </button>
          <button class="tab" :class="{ active: activeTab === 'guide' }" @click="activeTab = 'guide'; loadGuideContent()">
            <span>📖</span>
          </button>
        </div>
        <div class="chat-actions" v-if="activeTab === 'chat'">
          <button class="btn-icon-sm" @click="showHistoryPanel = !showHistoryPanel" title="Lịch sử Chat" :class="{ active: showHistoryPanel }">
            <History :size="16" />
          </button>
          <button class="btn-icon-sm" @click="newChatSession" title="Đoạn chat mới">
            <Plus :size="16" />
          </button>
        </div>
      </header>

      <div class="sidebar-content">
        <!-- Chat Area -->
        <div class="chat-area" v-if="activeTab === 'chat'">
          <!-- History Panel -->
          <div class="history-panel" v-if="showHistoryPanel">
            <div class="history-list" v-if="chatSessions.length > 0">
              <div 
                class="history-item" 
                v-for="session in chatSessions" 
                :key="session.id"
                :class="{ active: currentSessionId === session.id }"
                @click="loadSession(session)"
              >
                <div class="history-item-content">
                  <div class="history-title">{{ session.title || 'Không tên' }}</div>
                  <div class="history-date">{{ new Date(session.updatedAt || session.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }}</div>
                </div>
                <button class="btn-remove" @click="deleteSession(session.id, $event)" title="Xoá">
                  <Trash2 :size="14" />
                </button>
              </div>
            </div>
            <div v-else class="history-empty">Chưa có cuộc trò chuyện nào được lưu.</div>
          </div>
          
          <!-- Messages -->
          <div class="chat-messages" ref="chatMessagesRef" v-show="!showHistoryPanel">
            <div 
              v-for="(msg, index) in chatMessages" 
              :key="index"
              class="message" 
              :class="msg.role"
            >
              <div class="avatar">{{ msg.role === 'assistant' ? 'AI' : 'U' }}</div>
              <div v-if="msg.role === 'assistant' && !msg.content && isChatLoading && index === chatMessages.length - 1" class="bubble thinking-bubble">
                <div class="thinking-dots">
                  <span></span><span></span><span></span>
                </div>
                <span class="thinking-label">AI đang suy nghĩ...</span>
              </div>
              <div v-else class="bubble markdown-body" v-html="marked.parse(msg.content)"></div>
            </div>
          </div>
          <div class="chat-input-container" v-show="!showHistoryPanel">
            <input 
              v-model="chatInput" 
              type="text" 
              placeholder="Hỏi về code của bạn..."
              @keyup.enter="sendMessage"
              :disabled="isChatLoading || models.length === 0"
            />
            <button 
              class="btn-primary" 
              @click="sendMessage"
              :disabled="isChatLoading || models.length === 0"
            >
              {{ isChatLoading ? '...' : 'Gửi' }}
            </button>
          </div>
        </div>

        <!-- Knowledge Base Area -->
        <div class="knowledge-area" v-else-if="activeTab === 'knowledge'">
          <div class="p-4" style="padding: 1.5rem; overflow-y: auto; max-height: 100%; display: flex; flex-direction: column; gap: 1.5rem;">
            <h2 style="font-size: 1.25rem; font-weight: 600;">Hệ thống RAG Cục bộ</h2>

            <!-- Hardware Gauges -->
            <div class="hardware-panel glass-panel" v-if="hardwareMetrics" style="padding: 1rem; border-radius: 0.5rem;">
              <h3 style="font-size: 0.9rem; margin-bottom: 0.75rem; color: var(--text-secondary); display: flex; align-items: center; gap: 0.5rem;"><Activity :size="16" /> Theo dõi phần cứng</h3>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                <div class="gauge">
                  <span class="gauge-label">CPU</span>
                  <div class="gauge-bar-bg"><div class="gauge-bar-fill" :style="{ width: hardwareMetrics.cpu?.usage_percent + '%', background: hardwareMetrics.cpu?.usage_percent > 80 ? '#ef4444' : '#10b981' }"></div></div>
                  <span class="gauge-value" style="font-size: 0.8rem; text-align: right;">{{ hardwareMetrics.cpu?.usage_percent }}%</span>
                </div>
                <div class="gauge">
                  <span class="gauge-label">RAM ({{ hardwareMetrics.ram?.used_gb }}/{{ hardwareMetrics.ram?.total_gb }} GB)</span>
                  <div class="gauge-bar-bg"><div class="gauge-bar-fill" :style="{ width: hardwareMetrics.ram?.usage_percent + '%', background: hardwareMetrics.ram?.usage_percent > 85 ? '#ef4444' : '#3b82f6' }"></div></div>
                </div>
                <div class="gauge" v-if="hardwareMetrics.vram?.available">
                  <span class="gauge-label">VRAM ({{ hardwareMetrics.vram?.used_gb }}/{{ hardwareMetrics.vram?.total_gb }} GB)</span>
                  <div class="gauge-bar-bg"><div class="gauge-bar-fill" :style="{ width: hardwareMetrics.vram?.usage_percent + '%', background: hardwareMetrics.vram?.usage_percent > 85 ? '#ef4444' : '#8b5cf6' }"></div></div>
                </div>
                <div class="gauge" v-if="hardwareMetrics.npu?.available">
                  <span class="gauge-label">NPU (Intel Core Ultra)</span>
                  <span class="gauge-value" style="color: #10b981; font-size: 0.8rem;">Ready: {{ hardwareMetrics.npu?.name }}</span>
                </div>
              </div>
            </div>

            <!-- Activity Console -->
            <div class="activity-panel glass-panel" style="padding: 1rem; border-radius: 0.5rem; display: flex; flex-direction: column; gap: 0.75rem;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <h3 style="font-size: 0.9rem; color: var(--text-secondary);">
                  <Database :size="16" style="display: inline-block; vertical-align: middle; margin-right: 0.25rem;" /> Bảng điều khiển (Log)
                  <span v-if="indexStatus && indexStatus.isIndexed" style="margin-left: 0.5rem; font-size: 0.75rem; color: #10b981; font-weight: normal;">
                    (Đã Index: {{ indexStatus.chunkCount }} chunks - {{ new Date(indexStatus.lastUpdated || '').toLocaleString() }})
                  </span>
                </h3>
                <button class="btn-primary btn-sm" @click="handleIndexKnowledge" title="Tạo Vector DB cho dự án hiện tại">
                  {{ indexStatus && indexStatus.isIndexed ? 'Re-Index Project' : 'Index Project' }}
                </button>
              </div>
              <div v-if="activityProgress" style="margin-bottom: 0.5rem; background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 0.25rem;">
                <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.25rem;">
                  <span>{{ activityProgress.task }}</span>
                  <span>{{ activityProgress.percent }}% ({{ activityProgress.current }}/{{ activityProgress.total }})</span>
                </div>
                <div class="gauge-bar-bg"><div class="gauge-bar-fill" style="background: #10b981;" :style="{ width: activityProgress.percent + '%' }"></div></div>
                <div v-if="activityProgress.message" style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">{{ activityProgress.message }}</div>
              </div>
              <div class="log-container" style="background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.05); padding: 0.5rem; border-radius: 0.25rem; height: 180px; overflow-y: auto; font-family: monospace; font-size: 0.75rem; display: flex; flex-direction: column; gap: 0.35rem;">
                <div v-for="(log, idx) in activityLogs" :key="idx" :style="{ color: log.level === 'error' ? '#ef4444' : (log.level === 'warning' ? '#f59e0b' : (log.level === 'success' ? '#10b981' : '#e2e8f0')) }">
                  <span style="opacity: 0.4;">[{{ new Date(log.timestamp).toLocaleTimeString() }}]</span> {{ log.message }}
                </div>
                <div v-if="activityLogs.length === 0" style="color: var(--text-secondary); text-align: center; margin-top: 2rem;">
                  {{ indexStatus && indexStatus.isIndexed ? 'Dự án đã được index. Nhập câu hỏi bên dưới để tìm kiếm.' : 'Chưa có logs. Hãy bấm Index Project để bắt đầu.' }}
                </div>
              </div>
            </div>

            <!-- Semantic Search -->
            <div class="search-panel glass-panel" style="padding: 1rem; border-radius: 0.5rem;">
              <h3 style="font-size: 0.9rem; margin-bottom: 0.75rem; color: var(--text-secondary);"><Search :size="16" style="display: inline-block; vertical-align: middle; margin-right: 0.25rem;" /> Semantic Search</h3>
              <div class="chat-input-container">
                <input type="text" v-model="searchQuery" placeholder="Tìm kiếm logic, code snippet..." @keyup.enter="handleSearchKnowledge" />
                <button class="btn-primary" @click="handleSearchKnowledge" :disabled="isSearching || !searchQuery">
                  <Search :size="16" v-if="!isSearching" />
                  <span v-else>...</span>
                </button>
              </div>
              
              <div v-if="searchResults.length > 0" style="margin-top: 1rem; display: flex; flex-direction: column; gap: 0.5rem;">
                <div v-for="res in searchResults" :key="res.chunk_id" class="search-result-card" @click="() => { activeTab = 'chat'; chatInput = 'Giải thích đoạn code sau:\n```\n' + res.code_content + '\n```'; }" style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); padding: 0.75rem; border-radius: 0.5rem; cursor: pointer; transition: background 0.2s;">
                  <div style="font-size: 0.8rem; color: #60a5fa; margin-bottom: 0.25rem;">📄 {{ res.file_path }} <span style="float: right; color: #f59e0b; font-weight: bold;">⭐ {{(res.score).toFixed(2)}}</span></div>
                  <div style="font-size: 0.875rem; font-weight: 600; margin-bottom: 0.25rem;">{{ res.symbol_name }}</div>
                  <div style="font-size: 0.75rem; color: var(--text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4;">{{ res.summary }}</div>
                </div>
              </div>
              <div v-else-if="searchQuery && !isSearching" style="margin-top: 1rem; color: var(--text-secondary); text-align: center; font-size: 0.875rem;">Không có kết quả.</div>
            </div>

          </div>
        </div>

        <!-- Features Area -->
        <div class="features-area" v-else-if="activeTab === 'features'">
          <div class="p-4" style="padding: 1.5rem; overflow-y: auto; max-height: 100%;">
            <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem">Tính năng của dự án</h2>
            <button class="btn-primary w-full" @click="handleAction('evaluate-features')" :disabled="isEvaluatingFeatures || !graphData">
              {{ isEvaluatingFeatures ? 'Đang đánh giá...' : 'Đánh giá Tính năng (AI)' }}
            </button>

            <!-- Feature Clusters -->
            <div v-if="graphData?.features && graphData.features.length > 0" style="margin-top: 1rem">
              <h3 style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 0.75rem">Phát hiện các Cụm ({{ graphData.features.length }})</h3>
              <div v-for="cluster in graphData.features" :key="cluster.id" class="feature-card">
                <div class="feature-card-header">
                  <span class="feature-name">{{ cluster.name }}</span>
                  <span class="feature-badge">{{ cluster.files.length }} files</span>
                </div>
                <div class="feature-meta">
                  <span>{{ cluster.totalLines }} dòng</span>
                  <span v-if="cluster.sharedFiles.length > 0">· {{ cluster.sharedFiles.length }} chia sẻ</span>
                  <span v-if="cluster.entryPoints.length > 0">· {{ cluster.entryPoints.length }} entry</span>
                </div>
                <div class="feature-actions">
                  <button class="btn-secondary btn-sm" @click="handleAction('analyze-feature', cluster.id)" :disabled="isAnalyzingFeature === cluster.id || !activeModel">
                    {{ isAnalyzingFeature === cluster.id ? 'Đang phân tích...' : '🔍 Phân tích' }}
                  </button>
                </div>
                <div class="markdown-body mt-2" v-if="featureAnalysisResults[cluster.id]" v-html="marked.parse(featureAnalysisResults[cluster.id])"></div>
              </div>
            </div>
            <div v-else-if="graphData" style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 1rem">Không tìm thấy cụm tính năng nào. Hãy phân tích dự án trước.</div>

            <div class="mt-4" v-if="featuresMarkdown">
              <div class="flex justify-between items-center mb-2" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <h3 style="font-weight: 600; font-size: 1.1rem;">Báo cáo Tính năng</h3>
                <button class="btn-icon-sm" title="Tải báo cáo Markdown" @click="exportMarkdownReport">
                  <Download :size="16" />
                </button>
              </div>
              <div class="markdown-body" v-html="marked.parse(featuresMarkdown)"></div>
            </div>
          </div>
        </div>

        <!-- Health Area -->
        <div class="health-area" v-else-if="activeTab === 'health'">
          <div class="p-4" style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; overflow-y: auto; max-height: 100%;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <h2 style="font-size: 1.25rem; font-weight: 600">Sức khoẻ Hệ thống</h2>
              <button class="btn-secondary btn-sm" @click="fetchHealthReport(); fetchGitRecent()" :disabled="isLoadingHealth">
                {{ isLoadingHealth ? '⏳' : '🔄' }} Làm mới
              </button>
            </div>

            <!-- Health Score Gauge -->
            <div v-if="healthReport" class="health-score-panel" style="display: flex; align-items: center; gap: 1.5rem; padding: 1.25rem; background: rgba(0,0,0,0.25); border-radius: 0.75rem; border: 1px solid rgba(255,255,255,0.08);">
              <div style="position: relative; width: 80px; height: 80px; flex-shrink: 0;">
                <svg viewBox="0 0 36 36" style="width: 80px; height: 80px; transform: rotate(-90deg);">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="3" />
                  <circle cx="18" cy="18" r="15.9" fill="none" :stroke="healthScoreColor(healthReport.summary.healthScore)" stroke-width="3" stroke-linecap="round" :stroke-dasharray="`${healthReport.summary.healthScore} ${100 - healthReport.summary.healthScore}`" style="transition: stroke-dasharray 0.6s ease;" />
                </svg>
                <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; font-weight: 700;" :style="{ color: healthScoreColor(healthReport.summary.healthScore) }">
                  {{ healthReport.summary.healthScore }}
                </div>
              </div>
              <div style="flex: 1;">
                <div style="font-weight: 600; margin-bottom: 0.5rem;">Điểm sức khoẻ</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem 1rem; font-size: 0.8rem; color: var(--text-secondary);">
                  <span>📁 {{ healthReport.summary.totalFiles }} files</span>
                  <span>🔗 {{ healthReport.summary.totalEdges }} liên kết</span>
                  <span>🔄 {{ healthReport.circularDependencies?.length || 0 }} vòng tròn</span>
                  <span>👻 {{ healthReport.orphanFiles?.length || 0 }} mồ côi</span>
                  <span>🐘 {{ healthReport.godFiles?.length || 0 }} god files</span>
                  <span>💀 {{ healthReport.deadExportFiles?.length || 0 }} dead exports</span>
                </div>
              </div>
            </div>
            <div v-else-if="isLoadingHealth" style="text-align: center; padding: 1rem; color: var(--text-secondary);">⏳ Đang tải dữ liệu sức khoẻ...</div>

            <!-- High Impact Files -->
            <div class="health-card" v-if="healthReport?.highImpactFiles?.length > 0" style="background: rgba(59,130,246,0.08); border-color: rgba(59,130,246,0.3)">
              <h3 style="color: #3b82f6; font-weight: 600; margin-bottom: 0.5rem">🎯 File Ảnh hưởng Cao (≥3 importers)</h3>
              <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem">Sửa các file này ảnh hưởng dây chuyền nhiều nhất</p>
              <ul class="health-list">
                <li v-for="item in healthReport.highImpactFiles" :key="item.file">
                  <strong>{{ item.file }}</strong>
                  <span class="warning-msg" style="color: #3b82f6;">{{ item.importerCount }} importers · {{ item.lines }} dòng · {{ item.category }}</span>
                </li>
              </ul>
            </div>

            <!-- Git Recent Changes -->
            <div class="health-card" v-if="gitRecentChanges.length > 0" style="background: rgba(16,185,129,0.06); border-color: rgba(16,185,129,0.25)">
              <h3 style="color: #10b981; font-weight: 600; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;"><GitCommit :size="16" /> Thay đổi Gần đây (Git)</h3>
              <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                <div v-for="(commit, idx) in gitRecentChanges" :key="idx" style="padding: 0.5rem; background: rgba(0,0,0,0.15); border-radius: 0.375rem; font-size: 0.8rem;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                    <span style="font-weight: 600; color: #10b981;">{{ commit.hash }}</span>
                    <span style="color: var(--text-secondary); font-size: 0.75rem;">{{ commit.date }}</span>
                  </div>
                  <div style="margin-bottom: 0.25rem;">{{ commit.message }}</div>
                  <div style="color: var(--text-secondary); font-size: 0.75rem;">👤 {{ commit.author }} · {{ commit.changes?.length || 0 }} files</div>
                </div>
              </div>
            </div>
            <div v-else-if="isLoadingGit" style="text-align: center; padding: 0.5rem; color: var(--text-secondary); font-size: 0.85rem;">⏳ Đang tải lịch sử Git...</div>

            <div class="search-box">
              <input type="text" v-model="healthSearch" placeholder="Lọc file hoặc dependency..." />
            </div>

            <!-- Warning Summary -->
            <div class="health-card" v-if="graphData" style="background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.3)">
              <h3 style="color: #ef4444; font-weight: 600; margin-bottom: 0.5rem">⚠ God Files (File quá lớn)</h3>
              <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem">&gt;500 dòng VÀ được import bởi &gt;5 files</p>
              <ul class="health-list">
                <li v-for="node in graphData.nodes.filter((n: any) => n.warnings?.some((w: any) => w.type === 'god-file') && n.id.toLowerCase().includes(healthSearch.toLowerCase()))" :key="node.id">
                  <strong>{{ node.id }}</strong>
                  <span v-for="w in node.warnings.filter((w: any) => w.type === 'god-file')" :key="w.message" class="warning-msg">{{ w.message }}</span>
                </li>
                <li v-if="graphData.nodes.filter((n: any) => n.warnings?.some((w: any) => w.type === 'god-file')).length === 0" style="color: #10b981">Không tìm thấy! ✓</li>
              </ul>
            </div>

            <div class="health-card" v-if="graphData" style="background: rgba(245,158,11,0.08); border-color: rgba(245,158,11,0.3)">
              <h3 style="color: #f59e0b; font-weight: 600; margin-bottom: 0.5rem">⚡ High Fan-out (Import quá nhiều)</h3>
              <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem">File import &gt;10 file khác</p>
              <ul class="health-list">
                <li v-for="node in graphData.nodes.filter((n: any) => n.warnings?.some((w: any) => w.type === 'high-fan-out') && n.id.toLowerCase().includes(healthSearch.toLowerCase()))" :key="node.id">
                  <strong>{{ node.id }}</strong>
                  <span v-for="w in node.warnings.filter((w: any) => w.type === 'high-fan-out')" :key="w.message" class="warning-msg">{{ w.message }}</span>
                </li>
                <li v-if="graphData.nodes.filter((n: any) => n.warnings?.some((w: any) => w.type === 'high-fan-out')).length === 0" style="color: #10b981">Không tìm thấy! ✓</li>
              </ul>
            </div>

            <div class="health-card" v-if="graphData" style="background: rgba(139,92,246,0.08); border-color: rgba(139,92,246,0.3)">
              <h3 style="color: #8b5cf6; font-weight: 600; margin-bottom: 0.5rem">💀 Dead Exports (Export không dùng tới)</h3>
              <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem">Các file có export không ai dùng</p>
              <ul class="health-list">
                <li v-for="node in graphData.nodes.filter((n: any) => n.warnings?.some((w: any) => w.type === 'dead-exports') && n.id.toLowerCase().includes(healthSearch.toLowerCase()))" :key="node.id">
                  <strong>{{ node.id }}</strong>
                  <span v-for="w in node.warnings.filter((w: any) => w.type === 'dead-exports')" :key="w.message" class="warning-msg">{{ w.message }}</span>
                </li>
                <li v-if="graphData.nodes.filter((n: any) => n.warnings?.some((w: any) => w.type === 'dead-exports')).length === 0" style="color: #10b981">Không tìm thấy! ✓</li>
              </ul>
            </div>

            <div class="health-card" v-if="graphData">
              <h3 style="color: #ef4444; font-weight: 600; margin-bottom: 0.5rem">🔗 File Mồ Côi</h3>
              <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem">Không được import, không phải là entry point</p>
              <ul class="health-list">
                <li v-for="node in graphData.nodes.filter((n: any) => n.isOrphan && n.id.toLowerCase().includes(healthSearch.toLowerCase()))" :key="node.id">
                  {{ node.id }}
                </li>
                <li v-if="graphData.nodes.filter((n: any) => n.isOrphan).length === 0" style="color: #10b981">Không tìm thấy! ✓</li>
                <li v-else-if="graphData.nodes.filter((n: any) => n.isOrphan && n.id.toLowerCase().includes(healthSearch.toLowerCase())).length === 0" style="color: var(--text-secondary)">Không có kết quả cho "{{ healthSearch }}"</li>
              </ul>
            </div>

            <div class="health-card" v-if="graphData">
              <h3 style="color: #f59e0b; font-weight: 600; margin-bottom: 0.5rem">🔄 Dependency Vòng Tròn</h3>
              <ul class="health-list">
                <li v-for="edge in graphData.edges.filter((e: any) => {
                  const s = typeof e.source === 'object' ? e.source.id : e.source;
                  const t = typeof e.target === 'object' ? e.target.id : e.target;
                  return e.isCircular && (s.toLowerCase().includes(healthSearch.toLowerCase()) || t.toLowerCase().includes(healthSearch.toLowerCase()));
                })" :key="edge.source + edge.target">
                  {{ typeof edge.source === 'object' ? (edge.source as any).id : edge.source }} 🔄 {{ typeof edge.target === 'object' ? (edge.target as any).id : edge.target }}
                </li>
                <li v-if="graphData.edges.filter((e: any) => e.isCircular).length === 0" style="color: #10b981">Không tìm thấy! ✓</li>
              </ul>
            </div>

            <!-- Security Warnings from API -->
            <div class="health-card" v-if="healthReport?.securityWarnings?.length > 0" style="background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.4)">
              <h3 style="color: #ef4444; font-weight: 600; margin-bottom: 0.5rem">🛡️ Cảnh báo Bảo mật</h3>
              <ul class="health-list">
                <li v-for="item in healthReport.securityWarnings" :key="item.file">
                  <strong>{{ item.file }}</strong>
                  <span v-for="w in item.warnings.filter((ww: any) => ww.type === 'env-leak' || ww.type === 'hardcoded-secret' || ww.type === 'unsafe-dom')" :key="w.message" class="warning-msg" style="color: #ef4444;">{{ w.message }}</span>
                </li>
              </ul>
            </div>

            <!-- AI Audit Recommendation -->
            <div class="health-card" style="background: rgba(16,185,129,0.08); border-color: rgba(16,185,129,0.3)">
              <h3 style="color: #10b981; font-weight: 600; margin-bottom: 0.5rem">🤖 AI Đề xuất Cải tiến Kiến trúc</h3>
              <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.75rem">
                Sử dụng AI để phân tích sức khoẻ dự án và đưa ra kế hoạch refactoring ưu tiên.
              </p>
              <button class="btn-primary btn-sm" @click="handleAuditRecommend" :disabled="isAuditing || !activeModel">
                {{ isAuditing ? '⏳ Đang phân tích...' : '🚀 Bắt đầu AI Audit' }}
              </button>
              <div v-if="auditResult" class="audit-result" style="margin-top: 1rem; background: rgba(0,0,0,0.3); padding: 1rem; border-radius: 0.5rem; max-height: 400px; overflow-y: auto;">
                <div v-html="marked(auditResult)" style="font-size: 0.85rem; line-height: 1.6; color: var(--text-primary);"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Guide Area -->
        <div class="guide-area" v-else-if="activeTab === 'guide'" style="overflow-y: auto;">
          <div class="p-4" style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem;">
            <h2 style="font-size: 1.25rem; font-weight: 600">📖 Hướng dẫn Sử dụng Sub-AI</h2>
            <div v-if="isLoadingGuide" style="text-align: center; padding: 2rem; color: var(--text-secondary)">
              ⏳ Đang tải hướng dẫn...
            </div>
            <div v-else-if="guideContent" class="guide-content" v-html="marked(guideContent)" style="font-size: 0.85rem; line-height: 1.7; color: var(--text-primary); background: rgba(0,0,0,0.2); padding: 1.5rem; border-radius: 0.5rem;"></div>
            <div v-else style="text-align: center; padding: 2rem; color: var(--text-secondary)">
              Chưa có nội dung hướng dẫn. Hãy đảm bảo server đang chạy.
            </div>
          </div>
        </div>

        <!-- Settings Area -->
        <div class="settings-area" v-else-if="activeTab === 'settings'">
          <h2>Cấu hình</h2>
          <div class="form-group">
            <label>Mô hình (Model) đang dùng</label>
            <select v-model="activeModel">
              <option v-if="models.length === 0" value="">Đang tải models...</option>
              <option v-for="model in models" :key="model.id" :value="model.id">
                {{ model.name || model.id }} ({{ model.provider }})
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>OpenAI API Key</label>
            <input type="password" v-model="openAIKey" placeholder="sk-..." />
          </div>
          <div class="form-group">
            <label>Gemini API Key</label>
            <input type="password" v-model="geminiKey" placeholder="AIzaSy..." />
          </div>
          <button class="btn-primary w-full mt-4" @click="saveSettings">Lưu Cài đặt</button>

          <h2 class="mt-4">Cấu hình Vật lý (Chế độ Features)</h2>
          <div class="form-group">
            <label>Khoảng cách các Cụm: {{ physicsConfig.featureSpacing }}px</label>
            <input type="range" min="300" max="1500" step="50" v-model.number="physicsConfig.featureSpacing" />
          </div>
          <div class="form-group">
            <label>Lực hút trung tâm cụm: {{ physicsConfig.clusterGravity }}</label>
            <input type="range" min="0.1" max="2.0" step="0.1" v-model.number="physicsConfig.clusterGravity" />
          </div>
          <div class="form-group">
            <label>Lực đẩy giữa các Node: {{ physicsConfig.repulsion }}</label>
            <input type="range" min="-1000" max="-100" step="50" v-model.number="physicsConfig.repulsion" />
          </div>
          <div class="form-group">
            <label>Chiều dài liên kết: {{ physicsConfig.linkDistance }}px</label>
            <input type="range" min="50" max="300" step="10" v-model.number="physicsConfig.linkDistance" />
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  width: 100vw;
  height: 100vh;
}

.graph-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
}

.graph-header {
  position: absolute;
  top: 1.5rem;
  left: 1.5rem;
  right: 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 10;
  pointer-events: none; /* Let clicks pass through to graph */
}

.graph-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
  text-shadow: 0 2px 4px rgba(0,0,0,0.5);
}

.graph-header button {
  pointer-events: auto; /* Enable clicks on button */
}

.project-selector {
  display: flex;
  gap: 0.5rem;
  background: var(--surface-color);
  padding: 0.5rem;
  border-radius: 0.5rem;
  border: 1px solid var(--border-color);
  pointer-events: auto;
  align-items: center;
}

.project-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.project-input-wrapper input {
  min-width: 300px;
  background: rgba(0,0,0,0.2);
  border: 1px solid rgba(255,255,255,0.1);
  color: white;
  padding: 0.5rem;
  padding-right: 2rem;
  border-radius: 0.25rem;
  font-size: 0.875rem;
}

.btn-dropdown {
  position: absolute;
  right: 0.25rem;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 0.25rem;
}

.btn-dropdown:hover {
  color: var(--text-primary);
  background: rgba(255,255,255,0.1);
}

.recent-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 0.25rem;
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  z-index: 100;
  max-height: 300px;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}

.recent-dropdown-header {
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  color: var(--text-secondary);
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border-color);
}

.recent-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  transition: background 0.15s;
}

.recent-item:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.recent-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-remove {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 0.25rem;
  opacity: 0;
  transition: opacity 0.15s;
}

.recent-item:hover .btn-remove,
.history-item:hover .btn-remove {
  opacity: 1;
}

.btn-remove:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.graph-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder-text {
  color: var(--text-secondary);
  font-size: 1.25rem;
  opacity: 0.5;
}

.node-panel {
  position: absolute;
  top: 1.5rem;
  right: 1.5rem;
  width: 300px;
  padding: 1.5rem;
  z-index: 10;
  border-radius: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: var(--surface-color);
  border: 1px solid var(--border-color);
}

.node-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.node-panel-header h3 {
  font-size: 1.125rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-panel-path {
  font-size: 0.875rem;
  color: var(--text-secondary);
  word-break: break-all;
}

.node-stats {
  display: flex;
  gap: 0.5rem;
  margin: 0.5rem 0;
}

.stat-box {
  flex: 1;
  background: rgba(0,0,0,0.2);
  border-radius: 0.5rem;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.stat-value {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
}

.stat-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  color: var(--text-secondary);
  letter-spacing: 0.05em;
}

.node-panel-actions {
  display: flex;
  gap: 0.5rem;
}

.node-panel-actions button {
  flex: 1;
  padding: 0.5rem;
  font-size: 0.875rem;
}

.legend-panel {
  position: absolute;
  bottom: 1.5rem;
  left: 1.5rem;
  padding: 1rem;
  z-index: 10;
  border-radius: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  pointer-events: none;
}

.legend-panel h4 {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
}

.legend-note {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
  font-style: italic;
}

.sidebar-resizer {
  width: 4px;
  cursor: col-resize;
  background: var(--border-color);
  height: 100vh;
  transition: background 0.2s, width 0.2s;
  z-index: 100;
}

.sidebar-resizer:hover, .sidebar-resizer.active {
  background: var(--accent-color);
  width: 6px;
}

.sidebar {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--surface-color);
  border-left: 1px solid var(--border-color);
}

.sidebar-header {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.chat-actions {
  display: flex;
  gap: 0.25rem;
  margin-left: auto;
}

.btn-icon-sm {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.375rem;
  border-radius: 0.375rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.btn-icon-sm:hover, .btn-icon-sm.active {
  color: var(--text-primary);
  background: var(--surface-hover);
}

.tabs {
  display: flex;
  gap: 0.5rem;
  background: rgba(0,0,0,0.2);
  padding: 0.25rem;
  border-radius: 0.5rem;
}

.tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.tab.active {
  background: var(--surface-hover);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.tab:hover:not(.active) {
  color: var(--text-primary);
}

.sidebar-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Areas */
.chat-area, .health-area, .features-area, .settings-area, .knowledge-area, .guide-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  height: 0; /* Important for flex-grow to work with overflow */
}

/* Gauges */
.gauge {
  background: rgba(0,0,0,0.2);
  padding: 0.5rem;
  border-radius: 0.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.gauge-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
}
.gauge-value {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}
.gauge-bar-bg {
  width: 100%;
  height: 6px;
  background: rgba(255,255,255,0.1);
  border-radius: 3px;
  overflow: hidden;
}
.gauge-bar-fill {
  height: 100%;
  background: #3b82f6;
  transition: width 0.3s ease;
}

.chat-area {
  padding: 1rem;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1rem;
}

.message {
  display: flex;
  gap: 0.75rem;
  max-width: 100%;
}

.message.user {
  flex-direction: row-reverse;
}

.message.user .bubble {
  background: var(--accent-color);
  color: white;
  border-radius: 0.75rem;
  border-top-right-radius: 0;
}

.message.user .avatar {
  background: rgba(255, 255, 255, 0.2);
}

.avatar {
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  background: rgba(139, 92, 246, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: bold;
}

.bubble {
  background: var(--surface-hover);
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  border-top-left-radius: 0;
  font-size: 0.9375rem;
  line-height: 1.5;
  overflow-x: auto;
  max-width: calc(100% - 2.75rem); /* avatar width + gap */
  word-break: break-word;
}

/* Markdown specific styling */
.markdown-body :deep(p) { margin: 0 0 0.5rem 0; }
.markdown-body :deep(p:last-child) { margin-bottom: 0; }
.markdown-body :deep(pre) { background: rgba(0,0,0,0.3); padding: 0.5rem; border-radius: 0.25rem; overflow-x: auto; }
.markdown-body :deep(code) { font-family: monospace; background: rgba(0,0,0,0.2); padding: 0.1rem 0.2rem; border-radius: 0.2rem; }
.markdown-body :deep(ul), .markdown-body :deep(ol) { margin: 0.5rem 0; padding-left: 1.5rem; }

.chat-input-container {
  display: flex;
  gap: 0.5rem;
}

.chat-input-container input {
  flex: 1;
}

/* Settings Area */
.settings-area {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  overflow-y: auto;
}

.settings-area h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-size: 0.875rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.w-full {
  width: 100%;
}
.mt-4 {
  margin-top: 1rem;
}

/* History Panel */
.history-panel {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.history-list {
  display: flex;
  flex-direction: column;
}

.history-item {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  cursor: pointer;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  transition: background 0.15s;
  gap: 0.5rem;
}

.history-item:hover {
  background: var(--surface-hover);
}

.history-item.active {
  background: rgba(139, 92, 246, 0.15);
  border-left: 3px solid var(--accent-color);
}

.history-item-content {
  flex: 1;
  min-width: 0;
}

.history-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-date {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 0.125rem;
}

.history-empty {
  padding: 2rem;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

/* Feature Cards */
.feature-card {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
  transition: border-color 0.2s;
}
.feature-card:hover {
  border-color: rgba(139, 92, 246, 0.4);
}
.feature-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.25rem;
}
.feature-name {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text-primary);
}
.feature-badge {
  background: rgba(139, 92, 246, 0.2);
  color: #a78bfa;
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border-radius: 10px;
  font-weight: 500;
}
.feature-meta {
  font-size: 0.8rem;
  color: var(--text-secondary);
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.feature-actions {
  display: flex;
  gap: 0.5rem;
}

/* Warning messages in health tab */
.warning-msg {
  display: block;
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-top: 0.15rem;
}

/* Layout Toggle */
.btn-layout-toggle {
  font-size: 1.25rem;
  padding: 0.3rem 0.5rem;
}

/* Small button variant */
.btn-sm {
  font-size: 0.8rem;
  padding: 0.3rem 0.6rem;
}

.mt-2 {
  margin-top: 0.5rem;
}

/* Thinking indicator */
.thinking-bubble {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  min-height: 42px;
}

.thinking-dots {
  display: flex;
  gap: 4px;
  align-items: center;
}

.thinking-dots span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-primary, #a78bfa);
  animation: thinking-bounce 1.4s ease-in-out infinite;
}

.thinking-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.thinking-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes thinking-bounce {
  0%, 80%, 100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  40% {
    opacity: 1;
    transform: scale(1.1);
  }
}

.thinking-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-style: italic;
}

/* Guide & Audit markdown content */
.guide-content :deep(h1),
.guide-content :deep(h2),
.guide-content :deep(h3),
.audit-result :deep(h1),
.audit-result :deep(h2),
.audit-result :deep(h3) {
  color: #e2e8f0;
  margin-top: 1.2rem;
  margin-bottom: 0.5rem;
}
.guide-content :deep(h1),
.audit-result :deep(h1) {
  font-size: 1.3rem;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  padding-bottom: 0.5rem;
}
.guide-content :deep(h2),
.audit-result :deep(h2) {
  font-size: 1.1rem;
}
.guide-content :deep(h3),
.audit-result :deep(h3) {
  font-size: 0.95rem;
}
.guide-content :deep(code),
.audit-result :deep(code) {
  background: rgba(139, 92, 246, 0.15);
  color: #c4b5fd;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  font-size: 0.8rem;
}
.guide-content :deep(pre),
.audit-result :deep(pre) {
  background: rgba(0,0,0,0.4);
  padding: 0.75rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin: 0.5rem 0;
}
.guide-content :deep(pre code),
.audit-result :deep(pre code) {
  background: none;
  padding: 0;
}
.guide-content :deep(ul),
.guide-content :deep(ol),
.audit-result :deep(ul),
.audit-result :deep(ol) {
  padding-left: 1.5rem;
  margin: 0.5rem 0;
}
.guide-content :deep(li),
.audit-result :deep(li) {
  margin-bottom: 0.3rem;
}
.guide-content :deep(table),
.audit-result :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.75rem 0;
  font-size: 0.8rem;
}
.guide-content :deep(th),
.guide-content :deep(td),
.audit-result :deep(th),
.audit-result :deep(td) {
  border: 1px solid rgba(255,255,255,0.1);
  padding: 0.4rem 0.6rem;
  text-align: left;
}
.guide-content :deep(th),
.audit-result :deep(th) {
  background: rgba(139, 92, 246, 0.15);
  color: #c4b5fd;
  font-weight: 600;
}
.guide-content :deep(strong),
.audit-result :deep(strong) {
  color: #fbbf24;
}
.guide-content :deep(blockquote),
.audit-result :deep(blockquote) {
  border-left: 3px solid #8b5cf6;
  margin: 0.75rem 0;
  padding: 0.5rem 1rem;
  background: rgba(139, 92, 246, 0.08);
  color: var(--text-secondary);
}
</style>

