export type CarFilm = { update(progress: number): void; dispose(): void };

export type CarFilmOptions = {
  src?: string;
  poster?: string;
  /** The encoded video's frame rate; used to coalesce adjacent seek requests. */
  framesPerSecond?: number;
  /** Optional point in the journey at which the final film frame is reached. */
  endProgress?: number;
};

type DataConnection = EventTarget & { readonly saveData?: boolean };
const mounts = new WeakMap<HTMLElement, CarFilm>();
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const MAX_FILM_BYTES = 12 * 1024 * 1024;

/**
 * Mount a silent, paused film whose frame follows scroll progress. There is no
 * playback loop: one seek runs at a time and only the latest queued target wins.
 * The same-origin poster remains underneath the film and survives media failure.
 */
export function mountCarFilm(
  host: HTMLElement,
  onReady: () => void,
  onError: () => void,
  options: CarFilmOptions = {},
): CarFilm {
  mounts.get(host)?.dispose();

  const src = options.src ?? "/assets/car/nova-leoes-exploded.mp4";
  const posterSrc = options.poster ?? "/assets/car/nova-leoes-assembled.webp";
  const fps = Number.isFinite(options.framesPerSecond) ? clamp(options.framesPerSecond!, 1, 60) : 24;
  const endProgress = Number.isFinite(options.endProgress) ? clamp(options.endProgress!, 0.01, 1) : 1;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const connection = (navigator as Navigator & { connection?: DataConnection }).connection;
  const wrapper = document.createElement("div");
  wrapper.className = "nl-car-film";
  wrapper.setAttribute("aria-hidden", "true");
  wrapper.style.cssText = "position:absolute;left:0;right:0;top:50%;aspect-ratio:1912/1080;max-height:100%;transform:translateY(-50%);display:block;pointer-events:none;";
  wrapper.dataset.state = "loading";
  const poster = document.createElement("img");
  poster.className = "nl-car-film-poster";
  poster.alt = "";
  poster.decoding = "async";
  poster.draggable = false;
  poster.style.cssText = "position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:contain;";
  wrapper.appendChild(poster);

  let disposed = false;
  let failed = false;
  let notifiedReady = false;
  let notifiedError = false;
  let posterReady = false;
  let posterFailed = false;
  let posterDecoding = false;
  let video: HTMLVideoElement | null = null;
  let videoEvents: AbortController | null = null;
  let videoFetch: AbortController | null = null;
  let videoObjectUrl: string | null = null;
  let latestProgress = 0;
  let duration = 0;
  let pendingSeek = false;
  let requestedTime = Number.NaN;
  let frame = 0;
  let loadTimer = 0;
  let seekTimer = 0;
  const imageEvents = new AbortController();

  const staticPreferred = () => motion.matches || connection?.saveData === true;

  function notifyReady() {
    if (disposed || notifiedReady) return;
    notifiedReady = true;
    onReady();
  }

  function notifyError() {
    if (disposed || notifiedError) return;
    notifiedError = true;
    onError();
  }

  function stopVideo() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    window.clearTimeout(loadTimer);
    window.clearTimeout(seekTimer);
    loadTimer = seekTimer = 0;
    videoEvents?.abort();
    videoEvents = null;
    videoFetch?.abort();
    videoFetch = null;
    const previous = video;
    const previousUrl = videoObjectUrl;
    videoObjectUrl = null;
    video = null;
    duration = 0;
    pendingSeek = false;
    requestedTime = Number.NaN;
    if (previous) {
      previous.pause();
      previous.removeAttribute("src");
      previous.load();
      previous.remove();
    }
    if (previousUrl) URL.revokeObjectURL(previousUrl);
  }

  function failVideo() {
    if (disposed || failed) return;
    failed = true;
    stopVideo();
    wrapper.dataset.state = posterFailed ? "error" : "fallback";
    if (posterReady) notifyReady();
    notifyError();
  }

  function showFrame(current: HTMLVideoElement) {
    if (disposed || current !== video || current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    current.style.opacity = "1";
    wrapper.dataset.state = "ready";
    window.clearTimeout(loadTimer);
    loadTimer = 0;
    notifyReady();
  }

  function seekLatest() {
    frame = 0;
    const current = video;
    if (disposed || failed || !current || staticPreferred() || duration <= 0 || pendingSeek || current.seeking
      || current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    // Avoid seeking exactly to duration, where some decoders present a blank end frame.
    const lastFrame = Math.max(0, duration - 1 / fps);
    const desired = clamp(latestProgress / endProgress, 0, 1) * lastFrame;
    const target = Math.min(lastFrame, Math.round(desired * fps) / fps);
    // Track the requested time as well as currentTime: privacy settings may round
    // reported playback time and must not cause an endless seek/seeked cycle.
    if ((Number.isFinite(requestedTime) && Math.abs(target - requestedTime) < 0.5 / fps)
      || Math.abs(target - current.currentTime) < 0.5 / fps) {
      showFrame(current);
      return;
    }
    pendingSeek = true;
    requestedTime = target;
    seekTimer = window.setTimeout(failVideo, 15_000);
    try { current.currentTime = target; }
    catch { failVideo(); }
  }

  function schedule() {
    if (!disposed && !failed && video && !frame && !staticPreferred()) frame = window.requestAnimationFrame(seekLatest);
  }

  function startVideo() {
    if (disposed || failed || video || staticPreferred()) return;
    const current = document.createElement("video");
    video = current;
    videoEvents = new AbortController();
    const listenerOptions = { signal: videoEvents.signal };
    current.className = "nl-car-film-video";
    current.style.cssText = "position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:contain;opacity:0;pointer-events:none;";
    current.muted = true;
    current.defaultMuted = true;
    current.playsInline = true;
    current.preload = "auto";
    current.autoplay = false;
    current.loop = false;
    current.controls = false;
    current.disablePictureInPicture = true;
    current.disableRemotePlayback = true;
    current.tabIndex = -1;
    current.setAttribute("aria-hidden", "true");
    current.setAttribute("muted", "");
    current.setAttribute("playsinline", "");

    const metadata = () => {
      if (disposed || current !== video) return;
      if (!Number.isFinite(current.duration) || current.duration <= 0) { failVideo(); return; }
      duration = current.duration;
      schedule();
    };
    const decoded = () => {
      if (disposed || current !== video) return;
      if (!pendingSeek && !current.seeking) showFrame(current);
      schedule();
    };
    current.addEventListener("loadedmetadata", metadata, listenerOptions);
    current.addEventListener("durationchange", metadata, listenerOptions);
    current.addEventListener("loadeddata", decoded, listenerOptions);
    current.addEventListener("canplay", decoded, listenerOptions);
    current.addEventListener("seeked", () => {
      if (disposed || current !== video) return;
      pendingSeek = false;
      window.clearTimeout(seekTimer);
      seekTimer = 0;
      // A transport/decoder may clamp a seek to zero without emitting an error.
      // Allow frame and privacy rounding, but do not mistake an unmoved frame for success.
      if (Number.isFinite(requestedTime) && Math.abs(current.currentTime - requestedTime) > Math.max(2 / fps, 0.125)) {
        failVideo();
        return;
      }
      showFrame(current);
      schedule();
    }, listenerOptions);
    current.addEventListener("error", failVideo, listenerOptions);
    wrapper.dataset.state = "loading";
    wrapper.appendChild(current);
    // A complete local Blob is seekable even when a static host ignores Range.
    // No fetch begins at all when reduced motion or data saving is preferred.
    loadTimer = window.setTimeout(failVideo, 25_000);
    const download = new AbortController();
    videoFetch = download;
    void (async () => {
      const filmUrl = new URL(src, window.location.href);
      if (filmUrl.origin !== window.location.origin || !/^https?:$/.test(filmUrl.protocol) || filmUrl.username || filmUrl.password) {
        throw new Error("Film must use the site origin");
      }
      const response = await fetch(filmUrl.href, {
        mode: "same-origin", credentials: "same-origin", redirect: "error", signal: download.signal,
      });
      if (disposed || current !== video || download.signal.aborted || staticPreferred()) return;
      const mediaType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
      const reportedBytes = Number(response.headers.get("content-length"));
      if (!response.ok || !mediaType.startsWith("video/") || reportedBytes > MAX_FILM_BYTES) {
        throw new Error("Film response is invalid");
      }
      const blob = await response.blob();
      if (disposed || current !== video || download.signal.aborted || staticPreferred()) return;
      if (blob.size < 1024 || blob.size > MAX_FILM_BYTES || !blob.type.toLowerCase().startsWith("video/")) {
        throw new Error("Film data is invalid");
      }
      videoObjectUrl = URL.createObjectURL(blob);
      current.src = videoObjectUrl;
      current.load();
    })().catch(() => {
      if (!disposed && current === video && !download.signal.aborted && !staticPreferred()) failVideo();
    });
  }

  function preferenceChanged() {
    if (disposed) return;
    if (staticPreferred()) {
      stopVideo();
      wrapper.dataset.state = posterFailed ? "error" : "static";
      if (posterReady) notifyReady();
      else if (posterFailed) notifyError();
    } else {
      startVideo();
    }
  }

  async function posterDecoded() {
    if (disposed || posterDecoding || posterReady) return;
    posterDecoding = true;
    try { await poster.decode(); }
    catch {
      // A load event can precede a decode rejection during resource switching;
      // naturalWidth still identifies a usable browser-decoded image.
      if (!poster.naturalWidth) { posterError(); return; }
    }
    if (disposed) return;
    posterReady = true;
    if (staticPreferred() || failed) notifyReady();
  }

  function posterError() {
    if (disposed) return;
    posterFailed = true;
    poster.style.visibility = "hidden";
    if (staticPreferred() || failed) {
      wrapper.dataset.state = "error";
      notifyError();
    }
  }

  const handle: CarFilm = {
    update(progress) {
      if (disposed || !Number.isFinite(progress)) return;
      latestProgress = clamp(progress, 0, 1);
      schedule();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopVideo();
      imageEvents.abort();
      motion.removeEventListener("change", preferenceChanged);
      connection?.removeEventListener("change", preferenceChanged);
      poster.removeAttribute("src");
      wrapper.remove();
      if (mounts.get(host) === handle) mounts.delete(host);
    },
  };
  mounts.set(host, handle);
  poster.addEventListener("load", () => { void posterDecoded(); }, { signal: imageEvents.signal });
  poster.addEventListener("error", posterError, { signal: imageEvents.signal });
  motion.addEventListener("change", preferenceChanged);
  connection?.addEventListener("change", preferenceChanged);
  host.appendChild(wrapper);
  poster.src = posterSrc;
  if (poster.complete && poster.naturalWidth) void posterDecoded();
  preferenceChanged();
  return handle;
}
