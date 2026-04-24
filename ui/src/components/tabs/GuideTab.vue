<template>
  <div class="guide-area" style="overflow-y: auto;">
    <div class="p-4" style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem;">
      <h2 style="font-size: 1.25rem; font-weight: 600">📖 Hướng dẫn Sử dụng Sub-AI</h2>
      <div v-if="integrationStore.isLoadingGuide" style="text-align: center; padding: 2rem; color: var(--text-secondary)">
        ⏳ Đang tải hướng dẫn...
      </div>
      <div v-else-if="integrationStore.guideContent" class="guide-content" v-html="marked(integrationStore.guideContent)" style="font-size: 0.85rem; line-height: 1.7; color: var(--text-primary); background: rgba(0,0,0,0.2); padding: 1.5rem; border-radius: 0.5rem;"></div>
      <div v-else style="text-align: center; padding: 2rem; color: var(--text-secondary)">
        Chưa có nội dung hướng dẫn. Hãy đảm bảo server đang chạy.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { marked } from 'marked'
import { useIntegrationStore } from '../../stores/useIntegrationStore'

const integrationStore = useIntegrationStore()

onMounted(() => {
  integrationStore.loadGuideContent()
})
</script>

<style scoped>
.guide-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  height: 100%;
}
.guide-content :deep(h1),
.guide-content :deep(h2),
.guide-content :deep(h3) {
  color: #e2e8f0;
  margin-top: 1.2rem;
  margin-bottom: 0.5rem;
}
.guide-content :deep(h1) {
  font-size: 1.3rem;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  padding-bottom: 0.5rem;
}
.guide-content :deep(h2) {
  font-size: 1.1rem;
}
.guide-content :deep(h3) {
  font-size: 0.95rem;
}

.guide-content :deep(p) { margin: 0 0 0.5rem 0; }
.guide-content :deep(p:last-child) { margin-bottom: 0; }
.guide-content :deep(pre) { background: rgba(0,0,0,0.3); padding: 0.5rem; border-radius: 0.25rem; overflow-x: auto; }
.guide-content :deep(code) { font-family: monospace; background: rgba(0,0,0,0.2); padding: 0.1rem 0.2rem; border-radius: 0.2rem; }
.guide-content :deep(ul), .guide-content :deep(ol) { margin: 0.5rem 0; padding-left: 1.5rem; }
</style>
