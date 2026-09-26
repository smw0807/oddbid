<script setup lang="ts">
withDefaults(defineProps<{ index?: number; small?: boolean }>(), { index: 0, small: false });
const colors = ['#efb09d', '#eecb53', '#b8acd5', '#a5c4b9', '#acc5d8', '#d0ba9b'];
</script>

<template>
  <span
    class="avatar"
    :class="{ small }"
    :style="{ background: colors[index % colors.length] }"
    aria-hidden="true"
  >
    <svg viewBox="0 0 48 48" fill="none">
      <path
        v-if="index % 3 === 0"
        d="M10 23c0-18 28-18 28 0v14H10V23Z"
        fill="#fffaf0"
        stroke="currentColor"
        stroke-width="1.5"
      />
      <circle
        v-else-if="index % 3 === 1"
        cx="24"
        cy="25"
        r="14"
        fill="#fffaf0"
        stroke="currentColor"
        stroke-width="1.5"
      />
      <path
        v-else
        d="m11 37 2-24 10 4 11-6 4 26H11Z"
        fill="#fffaf0"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
      <path
        d="M19 24v3m10-3v3m-9 5c2 2 6 2 8 0"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
      <path
        v-if="index % 2 === 0"
        d="m14 12 4-5 5 5"
        stroke="currentColor"
        stroke-width="1.5"
        fill="none"
      />
    </svg>
  </span>
</template>
