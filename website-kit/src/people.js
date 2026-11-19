// The script of the timeline on a person page.
//
// The page works without it: the cards scroll sideways, the filter chips filter, and a card opens its list view.
// With it, a card opens its story ribbon: the items of the appearance one after another, each in a frame, with
// progress bars across the top. It also adds the row's arrows, which show only when the row holds more cards than
// fit. It reads nothing about the visitor and keeps nothing. The only thing it talks to is the YouTube player it
// puts in a frame: it tells that player to play, pause and turn its sound on or off, and hears when a video ends.

// ------------------------------------------------------------------------------------------------ the parts with no page in them

// How long a picture stays before the ribbon moves on, in seconds.
export const PICTURE_SECONDS = 6;
const PLAYER = 'https://www.youtube-nocookie.com';

// Where the ribbon goes from one frame: the next or the previous one. Before the first it stays on the first.
// After the last it closes, which is -1.
export function step(index, count, direction) {
  const next = index + direction;
  if (next < 0) return 0;
  return next >= count ? -1 : next;
}

// The address of YouTube's no-cookie player for one video: it starts by itself with the sound off, plays in
// the frame on a phone, and answers this page's messages.
export function playerAddress(video, origin) {
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(video)) return null;
  return `${PLAYER}/embed/${video}?enablejsapi=1&autoplay=1&mute=1&playsinline=1&rel=0&origin=${encodeURIComponent(origin)}`;
}

// What the page says to the player: that it is listening, and what to do.
export const LISTENING = JSON.stringify({ event: 'listening', id: 'tl', channel: 'widget' });
export const command = (func) => JSON.stringify({ event: 'command', func, args: [] });

// What the player says back, read down to what the ribbon uses: whether the video ended, and how far along it is.
// The player gives the video's length once, in its first answers, and the time in every later one.
export function readPlayer(data) {
  let message = data;
  if (typeof data === 'string') {
    try {
      message = JSON.parse(data);
    } catch {
      return null;
    }
  }
  const info = message && typeof message === 'object' ? message.info : null;
  if (!info || typeof info !== 'object') return null;
  return {
    ended: info.playerState === 0,
    time: typeof info.currentTime === 'number' ? info.currentTime : null,
    duration: typeof info.duration === 'number' && info.duration > 0 ? info.duration : null,
  };
}

// What a tap on a picture means, from where it fell across the picture: the left third goes back, the rest goes
// on, as in stories.
export function tap(x, width) {
  return width > 0 && x < width / 3 ? -1 : 1;
}

// What a swipe means, from how far the finger moved: left is next, right is back, down closes.
export function swipe(dx, dy) {
  if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.5) return dx < 0 ? 'next' : 'previous';
  return dy >= 90 && dy > Math.abs(dx) * 1.5 ? 'close' : null;
}

// ------------------------------------------------------------------------------------------------ the row's arrows

function arrows() {
  for (const scroller of document.querySelectorAll('.tl-scroll')) {
    const row = scroller.querySelector('.tl-row');
    const earlier = scroller.querySelector('.tl-prev');
    const later = scroller.querySelector('.tl-next');
    if (!row || !earlier || !later) continue;
    // The row starts at its right end, the newest work, and its position counts from there.
    const update = () => {
      const hidden = row.scrollWidth - row.clientWidth;
      const fromNewest = Math.abs(row.scrollLeft);
      earlier.hidden = hidden <= 4 || fromNewest >= hidden - 4;
      later.hidden = hidden <= 4 || fromNewest <= 4;
    };
    const move = (direction) => row.scrollBy({ left: direction * Math.max(240, row.clientWidth * 0.8), behavior: 'smooth' });
    earlier.addEventListener('click', () => move(-1));
    later.addEventListener('click', () => move(1));
    row.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    for (const choice of document.querySelectorAll('.tl-f')) choice.addEventListener('change', () => requestAnimationFrame(update));
    update();
  }
}

// ------------------------------------------------------------------------------------------------ the list view

// A list view that closes stops what it was playing.
function stopList(panel) {
  for (const media of panel.querySelectorAll('audio')) media.pause();
  for (const video of panel.querySelectorAll('details.player[open]')) {
    video.open = false;
    const frame = video.querySelector('iframe');
    if (frame) frame.src = frame.src; // loading the frame again puts the player back to its start, not playing
  }
}

const hasPopover = () => typeof HTMLElement !== 'undefined' && 'popover' in HTMLElement.prototype;

function showList(panel) {
  if (hasPopover()) panel.showPopover();
  else panel.classList.add('is-open');
}

function lists() {
  for (const panel of document.querySelectorAll('.tl-panel')) {
    if (hasPopover()) {
      panel.addEventListener('toggle', (event) => {
        if (event.newState === 'closed') stopList(panel);
      });
      continue;
    }
    // A browser without panels of its own: the card's button and the list's Close button show and hide it.
    for (const button of document.querySelectorAll(`[popovertarget="${panel.id}"]`)) {
      button.addEventListener('click', () => {
        const open = button.getAttribute('popovertargetaction') !== 'hide' && !panel.classList.contains('is-open');
        panel.classList.toggle('is-open', open);
        if (!open) stopList(panel);
      });
    }
  }
}

// ------------------------------------------------------------------------------------------------ the story ribbon

function ribbon(dialog) {
  const frames = [...dialog.querySelectorAll('.tl-frame')];
  const bars = [...dialog.querySelectorAll('.tl-rb-bars i')];
  const pauseButton = dialog.querySelector('.tl-rb-pause');
  const muteButton = dialog.querySelector('.tl-rb-mute');
  const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let at = -1;
  let paused = false;
  let muted = true;
  let held = false; // the viewer pressed Read or Listen, so this frame stays until they move on
  let elapsed = 0;
  let last = 0;
  let tick = 0;
  let player = null; // the YouTube frame of the video now showing
  let heard = false; // the player has answered
  let length = 0; // the video's length in seconds, once the player has said it
  let knock = 0;
  let audio = null; // the episode now playing

  const fill = (index, part) => {
    if (bars[index]) bars[index].style.width = `${Math.max(0, Math.min(1, part)) * 100}%`;
  };
  const tell = (func) => {
    if (player && player.contentWindow) player.contentWindow.postMessage(command(func), PLAYER);
  };
  const showButtons = () => {
    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseButton.setAttribute('aria-label', paused ? 'Play' : 'Pause');
    muteButton.setAttribute('aria-pressed', String(muted));
    muteButton.setAttribute('aria-label', muted ? 'Turn the sound on' : 'Turn the sound off');
  };

  const leave = () => {
    cancelAnimationFrame(tick);
    clearInterval(knock);
    if (player) player.remove();
    player = null;
    heard = false;
    length = 0;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    audio = null;
    held = false;
  };

  // A picture stays for a few seconds, unless the ribbon is paused or the viewer pressed its button.
  const count = (now) => {
    if (!paused && !held) elapsed += now - last;
    last = now;
    if (!held) fill(at, elapsed / (PICTURE_SECONDS * 1000));
    if (elapsed >= PICTURE_SECONDS * 1000) go(1);
    else tick = requestAnimationFrame(count);
  };

  const show = (index) => {
    leave();
    at = index;
    frames.forEach((frame, i) => {
      frame.hidden = i !== at;
      fill(i, i < at ? 1 : 0);
    });
    const frame = frames[at];
    const kind = frame.dataset.kind;
    // The styles read these two: what kind of frame is showing, and whether there is one before it.
    dialog.dataset.now = kind;
    dialog.dataset.first = String(at === 0);
    const address = kind === 'video' ? playerAddress(frame.dataset.video || '', location.origin) : null;
    if (address) {
      // The video plays in the frame, from YouTube's no-cookie player, with the sound off. The frame's request
      // says which site embeds it and nothing more, which the player needs to start at all.
      player = document.createElement('iframe');
      player.className = 'tl-player';
      player.title = frame.querySelector('.tl-frame-title')?.textContent || 'Video';
      player.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      player.allowFullscreen = true;
      player.referrerPolicy = 'strict-origin-when-cross-origin';
      player.src = address;
      const mine = player;
      mine.addEventListener('load', () => {
        // The player answers once it knows someone is listening. It is told until it does.
        let tries = 0;
        knock = setInterval(() => {
          if (player !== mine || heard || ++tries > 20) return clearInterval(knock);
          mine.contentWindow.postMessage(LISTENING, PLAYER);
        }, 400);
      });
      frame.querySelector('.tl-stage').appendChild(player);
      return;
    }
    elapsed = 0;
    last = performance.now();
    tick = requestAnimationFrame(count);
  };

  const close = () => {
    leave();
    at = -1;
    if (dialog.open) dialog.close();
  };
  function go(direction) {
    const next = step(at, frames.length, direction);
    if (next === -1) close();
    else show(next);
  }

  // What the player says: how far along the video is, and that it ended, which moves the ribbon on.
  window.addEventListener('message', (event) => {
    if (!player || event.source !== player.contentWindow || event.origin !== PLAYER) return;
    const said = readPlayer(event.data);
    if (!said) return;
    if (!heard) {
      heard = true;
      if (!muted) tell('unMute');
      if (paused) tell('pauseVideo');
    }
    if (said.duration !== null) length = said.duration;
    if (said.time !== null && length > 0) fill(at, said.time / length);
    if (said.ended) go(1);
  });

  pauseButton.addEventListener('click', () => {
    paused = !paused;
    showButtons();
    tell(paused ? 'pauseVideo' : 'playVideo');
    if (audio) paused ? audio.pause() : audio.play().catch(() => undefined);
  });
  muteButton.addEventListener('click', () => {
    muted = !muted;
    showButtons();
    tell(muted ? 'mute' : 'unMute');
    if (audio) audio.muted = muted;
  });
  dialog.querySelector('.tl-rb-close').addEventListener('click', close);
  dialog.querySelector('.tl-rb-next').addEventListener('click', () => go(1));
  dialog.querySelector('.tl-rb-prev').addEventListener('click', () => go(-1));
  dialog.querySelector('.tl-rb-all').addEventListener('click', (event) => {
    const list = document.getElementById(event.currentTarget.dataset.panel);
    close();
    if (list) showList(list);
  });
  // Escape closes a dialog by itself. Whatever closes it, what was playing stops.
  dialog.addEventListener('close', () => {
    leave();
    at = -1;
  });

  for (const frame of frames) {
    // A tap on a picture goes on, or back when it falls on the left third. A video belongs to its player:
    // nothing of this page's sits in front of it, which YouTube's rules for embedded players require, so a
    // video is moved past with the arrows beside it, the keys, or a swipe outside it.
    const stage = frame.querySelector('.tl-stage');
    stage.addEventListener('click', (event) => {
      if (frame.dataset.kind === 'video') return;
      const box = stage.getBoundingClientRect();
      go(tap(event.clientX - box.left, box.width));
    });
    // "Read" opens the article in a new tab, and the ribbon waits on this frame.
    for (const link of frame.querySelectorAll('.tl-frame-go a')) link.addEventListener('click', () => {
      held = true;
    });
    // "Listen" plays the episode in the frame, with its sound on. The bar follows it, and its end moves on.
    const listen = frame.querySelector('.tl-listen');
    const sound = frame.querySelector('audio');
    if (listen && sound) {
      listen.addEventListener('click', () => {
        if (audio === sound && !sound.paused) {
          sound.pause();
          listen.textContent = 'Listen';
          return;
        }
        held = true;
        audio = sound;
        muted = false;
        paused = false;
        sound.muted = false;
        showButtons();
        sound.play().catch(() => undefined);
        listen.textContent = 'Pause';
      });
      sound.addEventListener('timeupdate', () => {
        if (audio === sound && sound.duration > 0) fill(at, sound.currentTime / sound.duration);
      });
      sound.addEventListener('ended', () => {
        if (audio === sound) go(1);
      });
      sound.addEventListener('pause', () => {
        listen.textContent = 'Listen';
      });
      sound.addEventListener('play', () => {
        listen.textContent = 'Pause';
      });
    }
  }

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') go(1);
    else if (event.key === 'ArrowLeft') go(-1);
    else if (event.key === 'm' || event.key === 'M') muteButton.click();
    else if (event.key === ' ' && !event.target.closest('button, a')) pauseButton.click();
    else return;
    event.preventDefault();
  });

  // On a phone the ribbon swipes like stories: left for the next item, right for the one before, down to close.
  let from = null;
  dialog.addEventListener('touchstart', (event) => {
    const touch = event.changedTouches[0];
    from = touch ? [touch.clientX, touch.clientY] : null;
  }, { passive: true });
  dialog.addEventListener('touchend', (event) => {
    const touch = event.changedTouches[0];
    if (!from || !touch) return;
    const move = swipe(touch.clientX - from[0], touch.clientY - from[1]);
    from = null;
    if (move === 'next') go(1);
    else if (move === 'previous') go(-1);
    else if (move === 'close') close();
  }, { passive: true });

  return {
    open(index) {
      // A visitor who asked their device for less motion gets the ribbon paused: nothing moves on by itself.
      paused = calm;
      muted = true;
      showButtons();
      dialog.showModal();
      show(Math.max(0, Math.min(frames.length - 1, index)));
    },
  };
}

function ribbons() {
  if (typeof HTMLDialogElement === 'undefined') return;
  for (const button of document.querySelectorAll('.tl-open[data-ribbon]')) {
    const dialog = document.getElementById(button.dataset.ribbon);
    if (!dialog || !dialog.querySelector('.tl-frame')) continue;
    const story = ribbon(dialog);
    button.addEventListener('click', (event) => {
      // The card opens its ribbon in place of its list view, at the item that was clicked: the big picture and
      // the first line are the first item, and each small picture is an item further on.
      event.preventDefault();
      const clicked = event.target instanceof Element ? event.target.closest('[data-at]') : null;
      story.open(Number(clicked?.dataset.at ?? 0) || 0);
    });
  }
}

if (typeof document !== 'undefined') {
  arrows();
  lists();
  ribbons();
}
