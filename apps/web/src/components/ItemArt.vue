<script setup lang="ts">
import type { ItemId } from '@oddbid/shared';
defineProps<{ item: ItemId; compact?: boolean }>();
const keys = Array.from({ length: 30 }, (_, i) => ({
  x: 80 + (i % 10) * 20,
  y: 105 + Math.floor(i / 10) * 23,
}));
</script>

<template>
  <svg viewBox="0 0 360 280" class="item-art" :class="{ compact }" fill="none" aria-hidden="true">
    <g stroke="#20201e" stroke-linecap="square" stroke-linejoin="miter">
      <path d="m72 245 207-2m-182 7 155-1" stroke-width="2" />
      <path d="m78 241 14 3m159-3 18 2" stroke-width="4" />
    </g>

    <g v-if="item === 'duck'" stroke="#20201e" stroke-width="4" stroke-linejoin="round">
      <path
        d="m66 137 34 13 22-31 83-4c41 6 72 36 68 72-4 36-46 54-99 47-54-7-85-37-89-68l-19-29Z"
        fill="#20201e"
      />
      <path
        d="m63 130 39 15 25-32 76-4c37 7 70 34 65 68-5 34-46 50-94 43-46-5-77-28-84-59l-27-31Z"
        fill="#e9e5da"
      />
      <path
        d="M216 139c32-4 49-26 45-53-3-28-22-43-47-40-31 3-48 25-43 52l10 29-6 31 45 8-4-27Z"
        fill="#e9e5da"
      />
      <path d="m248 89 24 9 22 16-14 9-37-12 5-22Z" fill="#ee5038" />
      <path d="m250 109 25 5" stroke-width="3" />
      <path d="m177 133 45 13-4 18-45-11 4-20Z" fill="#ee5038" />
      <path d="m183 154-10 23 17-5 6-15" fill="#20201e" />
      <path d="M133 159c27-6 51 1 65 17-6 25-35 29-57 19l-18-24" fill="#20201e" />
      <path d="m134 168 37 19m-30-20 35 18m-22-18 30 15" stroke="#e9e5da" stroke-width="2" />
      <path d="m112 185 13 14m-3-18 17 24m-3-15 13 18m50 2 20-7m-10 10 16-6" stroke-width="2" />
      <path d="M184 91c-1-18 10-30 29-34" stroke-width="2" />
      <path d="m226 81 10-3" stroke-width="3" />
      <circle cx="231" cy="86" r="3.5" fill="#20201e" stroke="none" />
      <path d="m108 217 34 9m56 5 28-6" stroke-width="3" />
    </g>

    <g
      v-else-if="item === 'keyboard'"
      transform="rotate(-5 180 145)"
      stroke="#20201e"
      stroke-width="3"
      stroke-linejoin="miter"
    >
      <path d="m137 84-2-29c-1-14 26-19 27-2 1 15 26 13 25-5l-1-17" stroke-width="5" />
      <path d="m63 84 229 2 19 127-260-1L63 84Z" fill="#20201e" />
      <path d="m58 82 232 2 15 118H44L58 82Z" fill="#e9e5da" />
      <path d="m44 202 1 16 262 1-2-17H44Z" fill="#20201e" />
      <path d="m62 89 222 2" stroke="#ee5038" stroke-width="7" />
      <path d="m53 198 7-96m232 96-11-96" stroke-width="2" />
      <rect
        v-for="(key, i) in keys"
        :key="i"
        :x="key.x"
        :y="key.y"
        width="15"
        height="16"
        :fill="i === 0 ? '#ee5038' : i % 7 === 0 ? '#20201e' : '#e9e5da'"
        stroke-width="2"
      />
      <path d="M79 124h190m-190 23h190m-190 23h190" stroke-width="2" />
      <rect x="105" y="178" width="131" height="13" fill="#20201e" />
      <path
        d="m114 182 9 5m3-5 9 5m3-5 9 5m3-5 9 5m3-5 9 5m3-5 9 5m3-5 9 5m3-5 9 5m3-5 9 5"
        stroke="#e9e5da"
        stroke-width="1"
      />
      <text
        x="87.5"
        y="115.5"
        text-anchor="middle"
        fill="#20201e"
        stroke="none"
        font-size="5"
        font-family="monospace"
        font-weight="900"
      >
        ESC
      </text>
      <path d="m60 208 230 1" stroke="#e9e5da" stroke-width="1" />
    </g>

    <g v-else-if="item === 'banana'" stroke="#20201e" stroke-width="4" stroke-linejoin="miter">
      <path
        d="M86 184c54 15 119-14 162-105l18 19c-11 91-71 149-138 136-30-6-43-24-42-50Z"
        fill="#20201e"
      />
      <path
        d="M81 179c51 17 117-15 162-103l18 20c-16 72-77 119-130 118-23 0-43-13-50-35Z"
        fill="#e9e5da"
      />
      <path d="m243 76 4-27 22 5-8 42-18-20Z" fill="#ee5038" />
      <path d="m249 57 12 3m-14 3 13 3m-15 3 14 3" stroke-width="2" />
      <path d="m83 180-16-4-3 20 27 6" fill="#20201e" />
      <path d="M101 188c44 11 103-24 143-92" stroke-width="3" />
      <path
        d="m133 216 6 8m5-8 6 10m6-11 6 11m5-12 6 10m5-13 6 10m5-14 6 9m5-15 6 8m5-15 6 7m5-16 6 6m4-17 6 5m3-16 5 3"
        stroke="#e9e5da"
        stroke-width="2"
      />
      <path d="m132 191 7 6m5-10 7 5m5-11 7 5m5-12 7 5" stroke-width="2" />
      <path d="m174 167 27-18 11 17-27 18-11-17Z" fill="#ee5038" stroke-width="2" />
      <text
        transform="rotate(-34 193 167)"
        x="193"
        y="170"
        text-anchor="middle"
        fill="#20201e"
        stroke="none"
        font-size="9"
        font-family="monospace"
        font-weight="900"
      >
        24K
      </text>
    </g>

    <g v-else-if="item === 'sock'" stroke="#20201e" stroke-width="4" stroke-linejoin="miter">
      <path
        d="m159 60 72 12-20 121c-3 28-20 44-49 43l-49-6c-22-3-36-18-27-35 7-12 19-17 35-14l19 3 19-124Z"
        fill="#ee5038"
      />
      <path d="m156 82 70 12 6-31-72-12-4 31Z" fill="#e9e5da" />
      <path
        d="m166 58-4 24m16-22-4 24m16-22-4 24m16-22-4 24m16-22-4 24m16-22-4 24"
        stroke-width="2"
      />
      <path d="m153 103 68 12-4 17-67-12 3-17Z" fill="#20201e" />
      <path d="M191 156c-15 12-15 36 9 52l10-18 5-28-24-6Z" fill="#20201e" />
      <path d="M91 190c16 1 24 17 19 39-15-5-27-11-28-22l9-17Z" fill="#20201e" />
      <path d="m122 204 39 8 12-4m-48 5 34 7 9-3" stroke-width="2" />
      <path
        d="m156 137 9 9m-11 1 9 9m-11 1 9 9m-11 1 9 9m-11 1 9 9m15-49 9 9m-11 1 9 9m-11 1 9 9"
        stroke-width="2"
      />
      <path
        d="m88 204 15 11m-16-3 14 11m91-58 14 12m-17-4 14 12m-14-2 12 11"
        stroke="#e9e5da"
        stroke-width="2"
      />
    </g>

    <g v-else stroke="#20201e" stroke-width="4" stroke-linejoin="miter">
      <path
        d="M269 129c1 48-38 85-85 86-50 1-91-36-91-84-1-51 39-89 89-89 48 0 87 36 87 87Z"
        fill="#20201e"
      />
      <path
        d="M260 123c1 46-36 83-81 84-48 1-85-35-85-82-1-48 35-84 83-84 46 0 82 36 83 82Z"
        fill="#e9e5da"
      />
      <circle cx="217" cy="90" r="20" fill="#ee5038" stroke="none" />
      <path
        d="M103 164c31-14 44-8 63-4 30 7 52-16 89-7-9 33-36 54-76 55-33 0-62-17-76-44Z"
        fill="#e9e5da"
      />
      <path
        d="m117 180 18 15m-6-19 26 24m-11-26 30 29m-14-28 29 27m-12-30 27 26m-10-29 23 23m-8-30 19 23m-4-28 15 17"
        stroke-width="2"
      />
      <path d="m170 169 9-63 8 1-3 63-14-1Z" fill="#20201e" />
      <path
        d="M183 110c-26-23-45-9-49 7 17-7 33-10 49-7Zm0-1c12-27 35-19 47-3-18-4-32-2-47 3Zm0 0c-10-28-6-37 9-47-1 17-3 29-9 47Z"
        fill="#20201e"
      />
      <path d="M112 99c6-22 24-38 44-44m-35 21 12-10" stroke-width="2" />
      <path d="m119 210 122-1 11 27-144 1 11-27Z" fill="#20201e" />
      <path d="m124 216 110-1" stroke="#e9e5da" stroke-width="2" />
      <path d="m145 224 65-1" stroke="#ee5038" stroke-width="6" />
      <path d="m228 125 3 3m-109 4 3 2m16 15 3 2m75-6 3 2m-61-70 2 3" stroke-width="3" />
    </g>
  </svg>
</template>
