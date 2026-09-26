<script setup lang="ts">
import { computed } from 'vue';
const props = withDefaults(defineProps<{ index?: number; small?: boolean }>(), {
  index: 0,
  small: false,
});
const bidderNumber = computed(() =>
  String((((Math.floor(props.index) % 6) + 6) % 6) + 1).padStart(2, '0'),
);
</script>

<template>
  <span class="avatar" :class="{ small }" aria-hidden="true">
    <span class="avatar-number">{{ bidderNumber }}</span>
  </span>
</template>
