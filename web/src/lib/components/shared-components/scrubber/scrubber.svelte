<script lang="ts">
  import Icon from '$lib/components/elements/icon.svelte';
  import type { AssetStore, LiteBucket } from '$lib/stores/assets-store.svelte';
  import { mobileDevice } from '$lib/stores/mobile-device.svelte';
  import { fromLocalDateTime, type ScrubberListener } from '$lib/utils/timeline-util';
  import { mdiPlay } from '@mdi/js';
  import { clamp } from 'lodash-es';
  import { DateTime } from 'luxon';
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';

  interface Props {
    timelineTopOffset?: number;
    timelineBottomOffset?: number;
    height?: number;
    assetStore: AssetStore;
    scrubOverallPercent?: number;
    scrubBucketPercent?: number;
    scrubBucket?: { bucketDate: string | undefined };
    leadout?: boolean;
    onScrub?: ScrubberListener;
    onScrubKeyDown?: (event: KeyboardEvent, element: HTMLElement) => void;
    startScrub?: ScrubberListener;
    stopScrub?: ScrubberListener;
  }

  let {
    timelineTopOffset = 0,
    timelineBottomOffset = 0,
    height = 0,
    assetStore,
    scrubOverallPercent = 0,
    scrubBucketPercent = 0,
    scrubBucket = undefined,
    leadout = false,
    onScrub = undefined,
    onScrubKeyDown = undefined,
    startScrub = undefined,  
    stopScrub = undefined,
  }: Props = $props();

  let isHover = $state(false);
  let isDragging = $state(false);
  let hoverY = $state(0);
  let clientY = 0;
  let windowHeight = $state(0);
  let scrollBar: HTMLElement | undefined = $state();
    // Add these state variables at the top with your other state variables 888999888
  let touchStartY = $state(0);
  let touchStartTime = $state(0);
  let hasMovedEnough = $state(false);
  const DRAG_THRESHOLD = 10; // pixels to move before considering it a drag
  const TAP_THRESHOLD = 300; // milliseconds to differentiate between tap and drag

  const toScrollY = (percent: number) => percent * (height - HOVER_DATE_HEIGHT * 2);
  const toTimelineY = (scrollY: number) => scrollY / (height - HOVER_DATE_HEIGHT * 2);

  const HOVER_DATE_HEIGHT = 31.75;
  const MIN_YEAR_LABEL_DISTANCE = 16;
  const MIN_DOT_DISTANCE = 8;

  const toScrollFromBucketPercentage = (
    scrubBucket: { bucketDate: string | undefined } | undefined,
    scrubBucketPercent: number,
    scrubOverallPercent: number,
  ) => {
    if (scrubBucket) {
      let offset = relativeTopOffset;
      let match = false;
      for (const segment of segments) {
        if (segment.bucketDate === scrubBucket.bucketDate) {
          offset += scrubBucketPercent * segment.height;
          match = true;
          break;
        }
        offset += segment.height;
      }
      if (!match) {
        offset += scrubBucketPercent * relativeBottomOffset;
      }
      // 2px is the height of the indicator
      return offset - 2;
    } else if (leadout) {
      let offset = relativeTopOffset;
      for (const segment of segments) {
        offset += segment.height;
      }
      offset += scrubOverallPercent * relativeBottomOffset;
      return offset - 2;
    } else {
      // 2px is the height of the indicator
      return scrubOverallPercent * (height - HOVER_DATE_HEIGHT * 2) - 2;
    }
  };
  let scrollY = $derived(toScrollFromBucketPercentage(scrubBucket, scrubBucketPercent, scrubOverallPercent));
  let timelineFullHeight = $derived(assetStore.scrubberTimelineHeight + timelineTopOffset + timelineBottomOffset);
  let relativeTopOffset = $derived(toScrollY(timelineTopOffset / timelineFullHeight));
  let relativeBottomOffset = $derived(toScrollY(timelineBottomOffset / timelineFullHeight));

  type Segment = {
    count: number;
    height: number;
    dateFormatted: string;
    bucketDate: string;
    date: DateTime;
    hasLabel: boolean;
    hasDot: boolean;
  };

  const calculateSegments = (buckets: LiteBucket[]) => {
    let height = 0;
    let dotHeight = 0;

    let segments: Segment[] = [];
    let previousLabeledSegment: Segment | undefined;

    for (const [i, bucket] of buckets.entries()) {
      const scrollBarPercentage = bucket.bucketHeight / timelineFullHeight;

      const segment = {
        count: bucket.assetCount,
        height: toScrollY(scrollBarPercentage),
        bucketDate: bucket.bucketDate,
        date: fromLocalDateTime(bucket.bucketDate),
        dateFormatted: bucket.bucketDateFormattted,
        hasLabel: false,
        hasDot: false,
      };

      if (i === 0) {
        segment.hasDot = true;
        segment.hasLabel = true;
        previousLabeledSegment = segment;
      } else {
        if (previousLabeledSegment?.date?.year !== segment.date.year && height > MIN_YEAR_LABEL_DISTANCE) {
          height = 0;
          segment.hasLabel = true;
          previousLabeledSegment = segment;
        }
        if (i !== 1 && segment.height > 5 && dotHeight > MIN_DOT_DISTANCE) {
          segment.hasDot = true;
          dotHeight = 0;
        }

        height += segment.height;
        dotHeight += segment.height;
      }
      segments.push(segment);
    }

    return segments;
  };
  let activeSegment: HTMLElement | undefined = $state();
  const segments = $derived(calculateSegments(assetStore.scrubberBuckets));
  const hoverLabel = $derived(activeSegment?.dataset.label);
  const bucketDate = $derived(activeSegment?.dataset.timeSegmentBucketDate);
  const scrollHoverLabel = $derived.by(() => {
    const y = scrollY;
    let cur = 0;
    for (const segment of segments) {
      if (y <= cur + segment.height + relativeTopOffset) {
        return segment.dateFormatted;
      }
      cur += segment.height;
    }
    return '';
  });

  const handleMouseEvent = (event: { clientY: number; isDragging?: boolean }) => {
    const wasDragging = isDragging;

    isDragging = event.isDragging ?? isDragging;
    clientY = event.clientY;

    if (!scrollBar) {
      return;
    }

    const rect = scrollBar.getBoundingClientRect()!;
    const lower = 0;
    const upper = rect?.height - HOVER_DATE_HEIGHT * 2;
    hoverY = clamp(clientY - rect?.top - HOVER_DATE_HEIGHT, lower, upper);
    const x = rect!.left + rect!.width / 2;
    const elems = document.elementsFromPoint(x, clientY);
    const segment = elems.find(({ id }) => id === 'time-segment');
    let bucketPercentY = 0;
    if (segment) {
      activeSegment = segment as HTMLElement;

      const sr = segment.getBoundingClientRect();
      const sy = sr.y;
      const relativeY = clientY - sy;
      bucketPercentY = relativeY / sr.height;
    } else {
      const leadin = elems.find(({ id }) => id === 'lead-in');
      if (leadin) {
        activeSegment = leadin as HTMLElement;
      } else {
        activeSegment = undefined;
        bucketPercentY = 0;
      }
    }

    const scrollPercent = toTimelineY(hoverY);
    if (wasDragging === false && isDragging) {
      void startScrub?.(bucketDate, scrollPercent, bucketPercentY);
      void onScrub?.(bucketDate, scrollPercent, bucketPercentY);
    }

    if (wasDragging && !isDragging) {
      void stopScrub?.(bucketDate, scrollPercent, bucketPercentY);
      return;
    }

    if (!isDragging) {
      return;
    }

    void onScrub?.(bucketDate, scrollPercent, bucketPercentY);
  };
  const getTouch = (event: TouchEvent) => {
    if (event.touches.length === 1) {
      return event.touches[0];
    }
    return null;
  };


  

  // const onTouchStart = (event: TouchEvent) => {
  //   const touch = getTouch(event);
  //   if (!touch) {
  //     isHover = false;
  //     return;
  //   }
  //   const elements = document.elementsFromPoint(touch.clientX, touch.clientY);
  //   const isHoverScrollbar = elements.some(({ id }) => {
  //     return id === 'immich-scrubbable-scrollbar' || id === 'time-label';
  //   });

  //   isHover = isHoverScrollbar;

  //   if (isHoverScrollbar) {
  //     handleMouseEvent({
  //       clientY: touch.clientY,
  //       isDragging: true,
  //     });
  //   }
  // };

  const onTouchStart = (event: TouchEvent) => {
  const touch = getTouch(event);
  if (!touch) {
    isHover = false;
    return;
  }


  // Store initial touch position and time
  touchStartY = touch.clientY;
  touchStartTime = Date.now();
  hasMovedEnough = false;


  const elements = document.elementsFromPoint(touch.clientX, touch.clientY);
  const isHoverScrollbar = elements.some(({ id }) => {
    return id === 'immich-scrubbable-scrollbar' || id === 'time-label';
  });

  isHover = isHoverScrollbar;
  
  // Don't immediately start dragging - just record that we're hovering
  if (isHoverScrollbar) {
    handleMouseEvent({
      clientY: touch.clientY,
      isDragging: false // Change this to false initially
    });
  }
};




// Modify your onTouchMove to check if we've moved enough to consider it a drag
const onTouchMove = (event: TouchEvent) => {
  const touch = getTouch(event);
  if (!touch) return;
  
  if (isHover) {
    // Check if we've moved enough to consider it a drag
    const moveDistance = Math.abs(touch.clientY - touchStartY);
    
    if (!isDragging && moveDistance > DRAG_THRESHOLD) {
      hasMovedEnough = true;
      // Now start dragging
      handleMouseEvent({
        clientY: touch.clientY,
        isDragging: true
      });
    } else if (isDragging) {
      handleMouseEvent({
        clientY: touch.clientY
      });
      event.preventDefault();
    }
  } else {
    isHover = false;
  }
};

// Modify your onTouchEnd to check if it was a tap or a drag
const onTouchEnd = (event: TouchEvent) => {
  const elapsedTime = Date.now() - touchStartTime;
  
  // If it was a quick tap without much movement, don't trigger a scroll
  if (elapsedTime < TAP_THRESHOLD && !hasMovedEnough) {
    // It was just a tap, not a drag
    isDragging = false;
    isHover = false;
  } else if (isHover) {
    isHover = false;
  }
  
  if (isDragging) {
    handleMouseEvent({
      clientY,
      isDragging: false
    });
  }
};
  // const onTouchEnd = () => {
  //   if (isHover) {
  //     isHover = false;
  //   }
  //   handleMouseEvent({
  //     clientY,
  //     isDragging: false,
  //   });
  // };
  // const onTouchMove = (event: TouchEvent) => {
  //   const touch = getTouch(event);
  //   if (touch && isDragging) {
  //     handleMouseEvent({
  //       clientY: touch.clientY,
  //     });
  //     event.preventDefault();
  //   } else {
  //     isHover = false;
  //   }
  // };
  onMount(() => {
    const opts = {
      passive: false,
    };
    globalThis.addEventListener('touchmove', onTouchMove, opts);
    return () => {
      globalThis.removeEventListener('touchmove', onTouchMove);
    };
  });
  const usingMobileDevice = $derived(mobileDevice.pointerCoarse);
</script>

<svelte:window
  bind:innerHeight={windowHeight}
  onmousemove={({ clientY }) => (isDragging || isHover) && handleMouseEvent({ clientY })}
  onmousedown={({ clientY }) => isHover && handleMouseEvent({ clientY, isDragging: true })}
  onmouseup={({ clientY }) => handleMouseEvent({ clientY, isDragging: false })}
  ontouchstart={onTouchStart}
  ontouchend={onTouchEnd}
  ontouchcancel={onTouchEnd}
/>

<div
  transition:fly={{ x: 50, duration: 250 }}
  tabindex="-1"
  role="scrollbar"
  aria-controls="time-label"
  aria-valuenow={scrollY + HOVER_DATE_HEIGHT}
  aria-valuemax={toScrollY(100)}
  aria-valuemin={toScrollY(0)}
  id="immich-scrubbable-scrollbar"
  class="absolute right-0 z-[1] select-none bg-immich-bg hover:cursor-row-resize"
  style:padding-top={HOVER_DATE_HEIGHT + 'px'}
  style:padding-bottom={HOVER_DATE_HEIGHT + 'px'}
  style:width={isDragging ? '100vw' : '60px'}
  style:height={height + 'px'}
  style:background-color={isDragging ? 'transparent' : 'transparent'}
  bind:this={scrollBar}
  onmouseenter={() => (isHover = true)}
  onmouseleave={() => (isHover = false)}
  onkeydown={(event) => onScrubKeyDown?.(event, event.currentTarget)}
  draggable="false"
>
  {#if !usingMobileDevice && hoverLabel && (isHover || isDragging)}
    <div
      id="time-label"
      class={[
        { 'border-b-2': isDragging },
        { 'rounded-bl-md': !isDragging },
        'truncate opacity-85 pointer-events-none absolute right-0 z-[100] min-w-20 max-w-64 w-fit rounded-tl-md  border-immich-primary bg-immich-bg py-1 px-1 text-sm font-medium shadow-[0_0_8px_rgba(0,0,0,0.25)] dark:border-immich-dark-primary dark:bg-immich-dark-gray dark:text-immich-dark-fg',
      ]}
      style:top="{hoverY + 2}px"
    >
      {hoverLabel}
    </div>
  {/if}
  {#if usingMobileDevice && ((assetStore.scrolling && scrollHoverLabel) || isHover || isDragging)}
    <div
      id="time-label"
      class="rounded-l-full w-[32px] pl-2 text-white bg-immich-primary dark:bg-gray-600 hover:cursor-pointer select-none"
      style:top="{scrollY + HOVER_DATE_HEIGHT - 25}px"
      style:height="50px"
      style:right="0"
      style:position="absolute"
      in:fade={{ duration: 200 }}
      out:fade={{ duration: 200 }}
    >
      <Icon path={mdiPlay} size="20" class="-rotate-90 relative top-[9px] -right-[2px]" />
      <Icon path={mdiPlay} size="20" class="rotate-90 relative top-[1px] -right-[2px]" />
      {#if (assetStore.scrolling && scrollHoverLabel) || isHover || isDragging}
        <p
          transition:fade={{ duration: 200 }}
          style:bottom={50 / 2 - 30 / 2 + 'px'}
          style:right="36px"
          style:width="fit-content"
          class="truncate pointer-events-none absolute text-sm rounded-full w-[32px] py-2 px-4 text-white bg-immich-primary/90 dark:bg-gray-500 hover:cursor-pointer select-none font-semibold"
        >
          {scrollHoverLabel}
        </p>
      {/if}
    </div>
  {/if}
  <!-- Scroll Position Indicator Line -->
  {#if !usingMobileDevice && !isDragging}
    <div
      class="absolute right-0 h-[2px] w-10 bg-immich-primary dark:bg-immich-dark-primary"
      style:top="{scrollY + HOVER_DATE_HEIGHT}px"
    >
      {#if assetStore.scrolling && scrollHoverLabel}
        <p
          transition:fade={{ duration: 200 }}
          class="truncate pointer-events-none absolute right-0 bottom-0 z-[100] min-w-20 max-w-64 w-fit rounded-tl-md border-b-2 border-immich-primary bg-immich-bg/80 py-1 px-1 text-sm font-medium shadow-[0_0_8px_rgba(0,0,0,0.25)] dark:border-immich-dark-primary dark:bg-immich-dark-gray/80 dark:text-immich-dark-fg"
        >
          {scrollHoverLabel}
        </p>
      {/if}
    </div>
  {/if}
  <div id="lead-in" class="relative" style:height={relativeTopOffset + 'px'} data-label={segments.at(0)?.dateFormatted}>
    {#if relativeTopOffset > 6}
      <div class="absolute right-[0.75rem] h-[4px] w-[4px] rounded-full bg-gray-300"></div>
    {/if}
  </div>
  <!-- Time Segment -->
  {#each segments as segment (segment.date)}
    <div
      id="time-segment"
      class="relative"
      data-time-segment-bucket-date={segment.date}
      data-label={segment.dateFormatted}
      style:height={segment.height + 'px'}
    >
      {#if !usingMobileDevice && segment.hasLabel}
        <div class="absolute right-[1.25rem] top-[-16px] z-10 text-[12px] dark:text-immich-dark-fg font-immich-mono">
          {segment.date.year}
        </div>
      {/if}
      {#if !usingMobileDevice && segment.hasDot}
        <div class="absolute right-[0.75rem] bottom-0 h-[4px] w-[4px] rounded-full bg-gray-300"></div>
      {/if}
    </div>
  {/each}
  <div id="lead-out" class="relative" style:height={relativeBottomOffset + 'px'}></div>
</div>

<style>
  #immich-scrubbable-scrollbar,
  #time-segment {
    contain: layout size style;
  }
</style>
