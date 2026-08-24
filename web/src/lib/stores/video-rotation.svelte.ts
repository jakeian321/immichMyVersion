/**
 * Quarter-turn playback, for watching portrait video on a monitor turned on its side.
 *
 * A tall video fitted to a wide screen is pillarboxed into a narrow strip, so most of the
 * panel goes to waste. Turning the monitor sideways only helps if the picture is turned
 * with it, and rotating the picture alone isn't enough: the fit has already been computed
 * against the unrotated screen, so the strip just ends up lying on its side. The viewer
 * therefore also swaps the dimensions it fits against, which is what makes the video
 * cover the whole panel - the same result the Photos app gets by baking the rotation into
 * the file, but without touching the original.
 */
export const isVideoRotateMode = $state({ value: false });

/**
 * The angle held against the screen, or null to keep following it. A phone re-orients on
 * its own the moment it is tilted or set down, which drops the turn mid-video; pinning it
 * lets the screen change without the picture following.
 */
export const videoRotateLock = $state<{ value: boolean | null }>({ value: null });

/**
 * Whether the mode should actually take effect on the screen in front of it. A portrait
 * viewport already suits a portrait video, and turning it there would crop the video to a
 * ribbon to cover a screen it was already filling - so an armed mode waits, and engages
 * the moment a landscape screen shows up, unless an angle is being held. Shared rather
 * than duplicated because the viewer hides its own chrome on the same condition.
 */
export const shouldRotateVideo = (viewportWidth: number, viewportHeight: number): boolean =>
  isVideoRotateMode.value && (videoRotateLock.value ?? viewportWidth > viewportHeight);

/**
 * Arms or disarms the mode. Fullscreen goes with it because a turned video can only cover
 * the panel when the viewport is the same shape as the panel, and browser chrome makes it
 * shorter than that. The request has to ride on the click that calls this: browsers only
 * grant it from a real gesture, and the later click that opens a video is too far removed.
 */
export const toggleVideoRotateMode = async () => {
  isVideoRotateMode.value = !isVideoRotateMode.value;
  // a held angle belongs to the run it was set during, not to the next one
  videoRotateLock.value = null;

  try {
    if (isVideoRotateMode.value) {
      await document.documentElement.requestFullscreen();
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch {
    // fullscreen is an improvement, not a requirement - a refused request still leaves
    // the rotation working, just against a shorter viewport
  }
};

/** For pages that own the toggle to call on the way out, so an armed mode cannot follow
 *  the user somewhere with no way to turn it back off. */
export const clearVideoRotateMode = () => {
  if (!isVideoRotateMode.value) {
    return;
  }
  isVideoRotateMode.value = false;
  videoRotateLock.value = null;
  void document.exitFullscreen().catch(() => {});
};
