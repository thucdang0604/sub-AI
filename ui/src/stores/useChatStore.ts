import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useProjectStore } from './useProjectStore'
import { useIntegrationStore } from './useIntegrationStore'

export const useChatStore = defineStore('chat', () => {
  const chatInput = ref('')
  const chatMessages = ref<{role: string, content: string}[]>([
    { role: 'assistant', content: 'Hello! I am ready to help you analyze this codebase. Ask me anything.' }
  ])
  const chatSessions = ref<any[]>([])
  const currentSessionId = ref('')
  const showHistoryPanel = ref(false)
  const isChatLoading = ref(false)

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

  const newChatSession = () => {
    currentSessionId.value = ''
    chatMessages.value = [
      { role: 'assistant', content: 'Hello! I am ready to help you analyze this codebase. Ask me anything.' }
    ]
    showHistoryPanel.value = false
    const projectStore = useProjectStore()
    projectStore.aiReferencedNodes = []
  }

  const loadSession = async (session: any) => {
    try {
      const res = await fetch(`/api/ai/history/${session.id}`)
      if (res.ok) {
        const data = await res.json()
        chatMessages.value = data.messages || []
        currentSessionId.value = session.id
        showHistoryPanel.value = false
      }
    } catch (e) {
      console.error('Failed to load session', e)
    }
  }

  const deleteSession = async (id: string) => {
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

  const parseStreamData = (dataStr: string): { text: string, error: string | null } => {
    let text = ''
    let error: string | null = null
    try {
      const payload = JSON.parse(dataStr)
      if (payload.error) return { text: '', error: payload.error }
      if (payload.text !== undefined) return { text: payload.text, error: null }
      return { text: '', error: null }
    } catch (_) {}

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
      } catch (_) {}
    }
    if (!found) {
      text = dataStr
    }
    return { text, error }
  }

  const handleAction = async (action: string, featureId?: string) => {
    const integrationStore = useIntegrationStore()
    const projectStore = useProjectStore()
    
    if (projectStore.selectedNodes.length === 0 && !['what-to-edit', 'evaluate-features', 'analyze-feature'].includes(action)) return
    if (!integrationStore.activeModel) {
      alert('Please select an AI model first.')
      return
    }

    if (action === 'evaluate-features') {
      const confirmed = confirm('Đánh giá tính năng sẽ gửi sơ đồ của toàn bộ dự án lên AI để phân tích. Cần đảm bảo model bạn chọn hỗ trợ ngữ cảnh dài. Tiếp tục?');
      if (!confirmed) return;
      projectStore.isEvaluatingFeatures = true;
      projectStore.featuresMarkdown = '';
      
      try {
        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'evaluate-features', model: integrationStore.activeModel })
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
                  if (parsed.text) projectStore.featuresMarkdown += parsed.text;
                }
              }
            }
          }
        }
      } catch (e) {
        console.error(e);
        projectStore.featuresMarkdown = 'Lỗi phân tích tính năng.';
      } finally {
        projectStore.isEvaluatingFeatures = false;
      }
      return;
    }

    if (action === 'analyze-feature' && featureId) {
      projectStore.isAnalyzingFeature = featureId;
      projectStore.featureAnalysisResults[featureId] = '';
      try {
        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'analyze-feature', model: integrationStore.activeModel, featureId })
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
                  if (parsed.text) projectStore.featureAnalysisResults[featureId] += parsed.text;
                }
              }
            }
          }
        }
      } catch (e) {
        console.error(e);
        projectStore.featureAnalysisResults[featureId] = 'Lỗi phân tích.';
      } finally {
        projectStore.isAnalyzingFeature = null;
      }
      return;
    }
    
    isChatLoading.value = true
    
    let userMsg = ''
    const fileIds = projectStore.selectedNodes.map(n => n.id)
    if (action === 'summarize') userMsg = `Summarize ${fileIds.join(', ')}`
    if (action === 'impact') userMsg = `Impact analysis for ${fileIds.join(', ')}`
    if (action === 'what-to-edit') userMsg = `Analyze what to edit for: ${chatInput.value}`
    if (action === 'audit') userMsg = `Perform deep security and logic audit for ${fileIds.join(', ')}`
    
    chatMessages.value.push({ role: 'user', content: userMsg })
    chatMessages.value.push({ role: 'assistant', content: '' })
    projectStore.aiReferencedNodes = []
    
    showHistoryPanel.value = false

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          model: integrationStore.activeModel,
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
                projectStore.updateAIHighlights(chatMessages.value[chatMessages.value.length - 1].content)
              }
            }
          }
        }
      } else {
        chatMessages.value[chatMessages.value.length - 1].content = 'Error connecting to the AI server.'
      }
    } catch (e) {
      console.error('Chat error', e)
      chatMessages.value[chatMessages.value.length - 1].content = 'Failed to execute action.'
    } finally {
      isChatLoading.value = false
      await saveCurrentSession()
    }
  }

  return {
    chatInput,
    chatMessages,
    chatSessions,
    currentSessionId,
    showHistoryPanel,
    isChatLoading,
    fetchChatSessions,
    saveCurrentSession,
    newChatSession,
    loadSession,
    deleteSession,
    handleAction,
    parseStreamData
  }
})
