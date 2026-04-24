<template>
  <div class="chat-area">
    <!-- Chat Messages -->
    <div class="chat-messages" ref="chatMessagesRef">
      <div v-for="(msg, i) in chatStore.chatMessages" :key="i" :class="['message', msg.role]">
        <div class="avatar">{{ msg.role === 'user' ? 'U' : 'AI' }}</div>
        <div class="bubble markdown-body" v-html="marked(msg.content)"></div>
      </div>
      <div v-if="chatStore.isChatLoading" class="message assistant">
        <div class="avatar">AI</div>
        <div class="bubble thinking-bubble">
          <div class="thinking-dots">
            <span></span><span></span><span></span>
          </div>
          <span class="thinking-label">Đang phân tích dữ liệu...</span>
        </div>
      </div>
    </div>
    <!-- Input Form -->
    <form class="chat-input-container" @submit.prevent="chatStore.handleAction('chat')">
      <input type="text" v-model="chatStore.chatInput" placeholder="Hỏi về cấu trúc dự án..." :disabled="chatStore.isChatLoading" />
      <button type="submit" class="btn-primary" :disabled="chatStore.isChatLoading || !chatStore.chatInput.trim()">Gửi</button>
    </form>
    <!-- Node Specific Actions -->
    <div v-if="projectStore.selectedNodes.length > 0" class="mt-2" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
      <button class="btn-secondary btn-sm" @click="chatStore.handleAction('summarize')" :disabled="chatStore.isChatLoading">
        Tóm tắt Node đã chọn
      </button>
      <button class="btn-secondary btn-sm" @click="chatStore.handleAction('impact')" :disabled="chatStore.isChatLoading">
        Phân tích Ảnh hưởng
      </button>
      <button class="btn-secondary btn-sm" @click="chatStore.handleAction('audit')" :disabled="chatStore.isChatLoading">
        Audit Bảo mật/Logic
      </button>
      <button class="btn-secondary btn-sm" @click="projectStore.highlightBlastRadius()" :disabled="chatStore.isChatLoading">
        Highlight Blast Radius
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { marked } from 'marked'
import { useChatStore } from '../../stores/useChatStore'
import { useProjectStore } from '../../stores/useProjectStore'

const chatStore = useChatStore()
const projectStore = useProjectStore()

const chatMessagesRef = ref<HTMLElement | null>(null)

watch(() => chatStore.chatMessages, async () => {
  await nextTick()
  if (chatMessagesRef.value) {
    chatMessagesRef.value.scrollTop = chatMessagesRef.value.scrollHeight
  }
}, { deep: true })
</script>

<style scoped>
.chat-area {
  padding: 1rem;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  height: 100%;
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
  max-width: calc(100% - 2.75rem);
  word-break: break-word;
}

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
.btn-sm {
  font-size: 0.8rem;
  padding: 0.3rem 0.6rem;
}

.mt-2 {
  margin-top: 0.5rem;
}
</style>
