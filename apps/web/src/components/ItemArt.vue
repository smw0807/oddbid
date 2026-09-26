<script setup lang="ts">
import type { ItemId } from '@oddbid/shared';
defineProps<{ item: ItemId; compact?: boolean }>();
const keys = Array.from({ length: 30 }, (_, i) => ({
  x: 80 + (i % 10) * 20,
  y: 105 + Math.floor(i / 10) * 23,
}));
</script>

<template>
  <svg
    viewBox="0 0 360 280"
    class="item-art"
    :class="{ compact }"
    fill="none"
    stroke="var(--art-ink, #383a35)"
    stroke-width="2.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M94 244c47 3 124 3 173-1" stroke-width="2" opacity=".2" />

    <g v-if="item === 'duck'">
      <path
        d="M78 139c12 7 22 8 32-3l19-19c20-14 51-15 75-8 38 10 66 34 62 67-4 34-45 51-92 44-45-5-76-27-83-58-3-11-11-14-13-23Z"
        fill="var(--art-paper, #eeeade)"
      />
      <path
        d="M216 139c30-5 48-25 44-51-3-27-22-42-47-39-29 3-46 26-41 51 2 12 10 19 9 29l-5 26c10 8 26 12 43 9l-3-25Z"
        fill="var(--art-paper, #eeeade)"
      />
      <path
        d="M249 96c9 0 14 5 20 9 5 4 12 3 13 8 0 7-20 10-37-2l4-15Z"
        fill="var(--art-accent, #e89a7c)"
      />
      <path d="M254 111c7 3 13 4 20 3" stroke-width="1.7" />
      <path
        d="M177 137c13 8 26 12 44 12l-2 14c-16 1-31-3-44-11l2-15Z"
        fill="var(--art-accent, #e89a7c)"
      />
      <path
        d="M137 158c23-4 44 2 56 17-6 18-26 27-47 19-9-3-16-10-19-17"
        fill="var(--art-accent, #e89a7c)"
      />
      <path d="M141 171c10 9 21 12 32 9" stroke-width="1.8" />
      <path d="M188 86c2-14 12-22 25-25" stroke-width="2" opacity=".4" />
      <path d="M225 82c3-2 7-2 10 0" stroke-width="1.8" />
      <circle cx="231" cy="91" r="3" fill="var(--art-ink, #383a35)" stroke="none" />
    </g>

    <g v-else-if="item === 'keyboard'" transform="rotate(-3 180 145)">
      <path d="M138 85V58c0-17 26-20 27-2 0 15 24 14 24-3V36" />
      <path
        d="M71 89h209c7 0 12 5 13 12l12 102c1 8-4 14-12 14H59c-8 0-13-6-12-14l12-102c1-7 5-12 12-12Z"
        fill="var(--art-accent, #e89a7c)"
      />
      <path
        d="M71 84h207c8 0 12 4 13 12l13 97c1 7-4 11-11 11H60c-8 0-13-4-12-11l11-97c1-8 5-12 12-12Z"
        fill="var(--art-paper, #eeeade)"
      />
      <path d="M70 94h207" stroke="var(--art-accent, #e89a7c)" stroke-width="3" />
      <rect
        v-for="(key, i) in keys"
        :key="i"
        :x="key.x"
        :y="key.y"
        width="15"
        height="16"
        rx="3"
        :fill="i === 0 || i === 19 ? 'var(--art-accent, #e89a7c)' : 'var(--art-paper, #eeeade)'"
        stroke-width="1.5"
      />
      <rect
        x="107"
        y="178"
        width="127"
        height="14"
        rx="4"
        fill="var(--art-paper, #eeeade)"
        stroke-width="1.7"
      />
      <path d="M132 184h76" stroke-width="1.2" opacity=".35" />
      <text
        x="87.5"
        y="115.5"
        text-anchor="middle"
        fill="var(--art-ink, #383a35)"
        stroke="none"
        font-size="5"
        font-family="sans-serif"
        font-weight="700"
      >
        ESC
      </text>
    </g>

    <g v-else-if="item === 'banana'">
      <path
        d="M87 181c51 11 116-20 154-97 2-4 5-6 8-3l11 12c3 3 3 6 2 10-16 77-77 125-136 119-22-2-39-16-44-32-2-6 0-10 5-9Z"
        fill="var(--art-accent, #e89a7c)"
      />
      <path
        d="M87 181c51 11 116-20 154-97 2-4 5-6 8-3l9 10c-27 68-87 116-136 116-17 0-29-9-40-18-2-5 0-9 5-8Z"
        fill="var(--art-paper, #eeeade)"
      />
      <path
        d="m243 81 4-24c1-5 4-7 8-6l8 2c4 1 6 4 5 8l-7 32c-6-2-12-6-18-12Z"
        fill="var(--art-accent, #e89a7c)"
      />
      <path d="m250 63 10 2" stroke-width="1.7" />
      <path d="m84 182-9-2c-4-1-7 1-7 5l-1 7c0 4 2 6 6 7l14 3" fill="var(--art-ink, #383a35)" />
      <path d="M109 188c36 5 79-18 112-62" stroke-width="2" />
      <g transform="rotate(-29 192 169)">
        <rect
          x="174"
          y="158"
          width="36"
          height="22"
          rx="5"
          fill="var(--art-accent, #e89a7c)"
          stroke-width="1.5"
        />
        <text
          x="192"
          y="173"
          text-anchor="middle"
          fill="var(--art-ink, #383a35)"
          stroke="none"
          font-size="10"
          font-family="sans-serif"
          font-weight="700"
        >
          24K
        </text>
      </g>
    </g>

    <g v-else-if="item === 'sock'">
      <path
        d="m164 61 57 9c6 1 9 6 8 12l-19 108c-4 28-21 44-48 44l-48-5c-23-3-35-18-26-33 6-11 17-15 32-13l23 3 17-119c0-4 1-6 4-6Z"
        fill="var(--art-accent, #e89a7c)"
      />
      <path
        d="m165 55 61 10c4 1 6 3 5 7l-3 15c-1 5-4 7-9 6l-58-9c-5-1-7-4-6-8l3-15c1-4 3-7 7-6Z"
        fill="var(--art-paper, #eeeade)"
      />
      <path d="m169 62-3 16m15-14-3 16m15-14-3 16m15-14-3 16m15-14-3 16" stroke-width="1.7" />
      <path d="m155 106 65 11m-67 1 65 11" stroke-width="2" />
      <path d="M193 160c-15 12-15 32 7 46 6-9 9-23 12-41l-19-5Z" fill="var(--art-paper, #eeeade)" />
      <path
        d="M94 190c14 2 21 17 17 39-16-4-27-12-27-23 0-6 4-12 10-16Z"
        fill="var(--art-paper, #eeeade)"
      />
      <path d="M128 209c12 4 24 5 35 4" stroke-width="1.8" />
      <path d="m166 145-3 18m14-16-2 12" stroke-width="1.6" opacity=".4" />
    </g>

    <g v-else>
      <circle cx="179" cy="125" r="84" fill="var(--art-paper, #eeeade)" />
      <circle cx="217" cy="90" r="18" fill="var(--art-accent, #e89a7c)" stroke="none" />
      <path
        d="M104 162c25-10 42-8 61-3 26 7 51-12 87-8-10 35-37 57-74 57-33 0-60-17-74-46Z"
        fill="var(--art-accent, #e89a7c)"
      />
      <path d="M131 184c18 7 39 10 59 5m12-3 11-3" stroke-width="1.8" />
      <path d="M175 166c4-18 6-37 8-57" stroke-width="4" />
      <path
        d="M183 111c-14-13-31-13-39-1-3 4-3 8 1 7 12-5 24-7 38-6Zm0 0c9-17 26-22 37-10 3 4 4 8 0 7-14-4-23-1-37 3Zm0-1c-6-18-4-30 6-35 4-2 5 1 4 5-2 12-6 21-10 30Z"
        fill="var(--art-paper, #eeeade)"
        stroke-width="2.5"
      />
      <path d="M114 98c6-18 19-30 36-37" stroke-width="3" opacity=".3" />
      <path
        d="M122 210h113c4 0 7 2 8 6l4 12c2 5-1 8-6 8H115c-5 0-7-3-5-8l5-12c1-4 3-6 7-6Z"
        fill="var(--art-accent, #e89a7c)"
      />
      <rect
        x="148"
        y="219"
        width="60"
        height="9"
        rx="4"
        fill="var(--art-paper, #eeeade)"
        stroke-width="1.4"
      />
      <g fill="var(--art-ink, #383a35)" stroke="none" opacity=".5">
        <circle cx="231" cy="128" r="1.8" />
        <circle cx="123" cy="132" r="1.6" />
        <circle cx="154" cy="78" r="1.6" />
      </g>
    </g>
  </svg>
</template>
