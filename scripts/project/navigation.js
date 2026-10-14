// Navigation controller for the cover, information, game and final layouts.
// Kept separate from SekSekStages so page buttons do not affect game logic.
import { SekSekStages, getSavedGameScore } from "./seksekStages.js";

export class LayoutNavigation {
  constructor(runtime) {
    this.runtime = runtime;
    this.gameWidth = 1920;
    this.gameHeight = 1080;
    this.routes = {
      kapak: {
        btn_home: "oyun", btn_play: "oyun", btn_info: "bilgi",
        btn_references: "__references_page", btn_produced: "__produced_page",
        btn_sesac: "__sound_off",
        btn_seskapat: "__sound_on", btn_ekrankapla: "__fullscreen",
        btn_ekranikucult: "__exit_fullscreen"
      },
      bilgi: {
        btn_home: "kapak", btn_info: "__info_page",
        btn_references: "__references_page", btn_produced: "__produced_page",
        btn_sesac: "__sound_off",
        btn_seskapat: "__sound_on", btn_ekrankapla: "__fullscreen",
        btn_ekranikucult: "__exit_fullscreen"
      },
      oyun: {
        btn_home: "kapak", btn_tas_at: "__start_game",
        btn_sesac: "__sound_off", btn_seskapat: "__sound_on",
        btn_ekrankapla: "__fullscreen", btn_ekranikucult: "__exit_fullscreen"
      },
      final: {
        btn_home: "oyun", btn_tekrardene: "oyun",
        btn_info: "__info_page", btn_references: "__references_page",
        btn_produced: "__produced_page", btn_sesac: "__sound_off",
        btn_seskapat: "__sound_on", btn_ekrankapla: "__fullscreen",
        btn_ekranikucult: "__exit_fullscreen"
      }
    };
    this.lastHandledAt = 0;
    this.buttonAreas = new Map();
    this.buttonAreaLayout = "";
    this.fullscreenButtonPositions = new Map();
    this.audioButtonPositions = new Map();
    this.hoverButtonNames = [
      "btn_ekranikucult", "btn_info", "btn_ekrankapla", "btn_home",
      "btn_references", "btn_produced", "btn_play", "btn_sesac",
      "btn_tas_at", "btn_tekrardene", "btn_seskapat"
    ];
    this.backgroundMusicStarted = false;
    this.backgroundMusicPaused = false;
    this.backgroundAudioSource = null;
    this.backgroundAudioBuffer = null;
    this.backgroundAudioLoading = null;
    this.effectAudioBuffers = new Map();
    this.effectAudioLoading = new Map();
    this.backgroundAudioStartTime = 0;
    this.backgroundAudioOffset = 0;
    this.backgroundMusicRequestId = 0;
    this.backgroundMusicStarting = false;
    this.audioMuted = false;
    this.syncGameOverlay();
    this.refreshButtonHitAreas();
    runtime.addEventListener("pointerdown", event => this.handlePointer(event));
    runtime.addEventListener("pointerup", event => this.handlePointer(event));
    runtime.addEventListener("pointermove", event => this.updateButtonHover(event));
    const canvas = runtime.canvas || document.querySelector("canvas");
    canvas?.addEventListener("pointerdown", event => this.handlePointer(event));
    canvas?.addEventListener("pointerup", event => this.handlePointer(event));
    canvas?.addEventListener("pointermove", event => this.updateButtonHover(event));
    canvas?.addEventListener("pointerleave", () => this.clearButtonHover());
    document.addEventListener("pointerdown", event => this.handlePointer(event), true);
    document.addEventListener("pointerup", event => this.handlePointer(event), true);
    document.addEventListener("pointermove", event => this.updateButtonHover(event), true);
    runtime.addEventListener("afterlayoutstart", () => {
      this.disableTasDragDrop();
      this.syncGameOverlay();
      this.refreshButtonHitAreas();
      this.applyPendingPageFrame();
      this.syncBackgroundMusic();
      this.syncAudioButtons();
      this.syncFinalScore();
      setTimeout(() => this.refreshButtonHitAreas(), 50);
      setTimeout(() => this.syncFinalScore(), 50);
    });
    // Attempt autoplay as soon as the initial layout is available. If the
    // browser requires a gesture, handlePointer() retries without waiting for
    // the game or an answer to start.
    this.syncBackgroundMusic();
  }

  currentLayoutObject(objectName) {
    const objectType = this.runtime.objects[objectName];
    if (!objectType) return null;
    const instances = objectType.getAllInstances?.() || [];
    const layoutName = this.currentLayoutName();
    return instances.find(instance =>
      instance.layer?.layout?.name === layoutName || instance.layout?.name === layoutName
    ) || objectType.getFirstInstance?.() || null;
  }

  syncFinalScore() {
    if (this.currentLayoutName() !== "final") return;
    const scoreText = this.currentLayoutObject("Text_score");
    const runtimeScore = Number(this.runtime.__sekSekScore);
    const storedScore = Number.isFinite(runtimeScore) ? runtimeScore : getSavedGameScore();
    if (scoreText && Number.isFinite(storedScore)) scoreText.text = String(storedScore);

    const medal = this.currentLayoutObject("madalya");
    if (!medal || !Number.isFinite(storedScore)) return;
    const correctCount = Math.max(0, Math.floor(storedScore / 10));
    let frame = 3;
    if (correctCount >= 13) frame = 0;
    else if (correctCount >= 9) frame = 1;
    else if (correctCount >= 5) frame = 2;
    medal.animationFrame = frame;
  }

  currentLayoutName() {
    // Construct throws while no layout is running; navigation is also
    // created during project startup, so this must be guarded.
    try {
      return this.runtime.layout?.name || "";
    } catch (_) {
      return "";
    }
  }

  currentLayoutInstance(objectName) {
    const objectType = this.runtime.objects[objectName];
    if (!objectType) return null;
    const instances = objectType.getAllInstances?.() || [];
    const layoutName = this.currentLayoutName();
    const current = instances.find(instance =>
      instance.layer?.layout?.name === layoutName || instance.layout?.name === layoutName
    );
    return current || objectType.getFirstInstance?.() || null;
  }

  layoutPoint(event) {
    if (typeof event.x === "number" && typeof event.clientX !== "number") {
      return { x: event.x, y: event.y };
    }
    const canvas = this.runtime.canvas || document.querySelector("canvas");
    const rect = canvas?.getBoundingClientRect?.();
    const clientX = typeof event.clientX === "number" ? event.clientX : event.x;
    const clientY = typeof event.clientY === "number" ? event.clientY : event.y;
    if (!rect || !rect.width || !rect.height) return { x: clientX, y: clientY };
    const scale = Math.min(rect.width / this.gameWidth, rect.height / this.gameHeight);
    const drawnWidth = this.gameWidth * scale;
    const drawnHeight = this.gameHeight * scale;
    return {
      x: (clientX - rect.left - (rect.width - drawnWidth) / 2) / scale,
      y: (clientY - rect.top - (rect.height - drawnHeight) / 2) / scale
    };
  }

  hit(instance, point) {
    if (!instance) return false;
    // Use the rendered instance rectangle rather than collision polygons.
    // UI buttons can have irregular artwork/collision data, which made clicks
    // appear intermittent even when the pointer was visibly over the button.
    const left = instance.x - instance.width * (instance.originX ?? 0.5);
    const top = instance.y - instance.height * (instance.originY ?? 0.5);
    return point.x >= left && point.x <= left + Math.abs(instance.width) &&
      point.y >= top && point.y <= top + Math.abs(instance.height);
  }

  refreshButtonHitAreas() {
    const layoutName = this.currentLayoutName();
    const route = this.routes[layoutName];
    this.buttonAreas.clear();
    this.buttonAreaLayout = layoutName;
    if (!route) return;
    for (const buttonName of Object.keys(route)) {
      const objectType = this.runtime.objects[buttonName];
      const buttons = objectType?.getAllInstances?.() || [];
      const areas = [];
      for (const button of buttons) {
        const belongsToLayout = button.layer?.layout?.name === layoutName ||
          button.layout?.name === layoutName ||
          (!button.layer?.layout && !button.layout);
        if (!belongsToLayout) continue;
        const width = Math.abs(Number(button.width) || 0);
        const height = Math.abs(Number(button.height) || 0);
        const originX = Number.isFinite(button.originX) ? button.originX : 0.5;
        const originY = Number.isFinite(button.originY) ? button.originY : 0.5;
        const left = button.x - width * originX;
        const top = button.y - height * originY;
        areas.push({
          left, top, right: left + width, bottom: top + height,
          visible: button.isVisible !== false
        });
      }
      if (areas.length) this.buttonAreas.set(buttonName, areas);
    }
  }

  hitButtonArea(buttonName, point) {
    // Read the live instance position on every press. The sound buttons are
    // moved when their state changes, so a cached rectangle can otherwise
    // remain at the previous button position.
    const layoutName = this.currentLayoutName();
    const liveButtons = this.runtime.objects[buttonName]?.getAllInstances?.() || [];
    for (const button of liveButtons) {
      const belongsToLayout = button.layer?.layout?.name === layoutName ||
        button.layout?.name === layoutName ||
        (!button.layer?.layout && !button.layout);
      if (!belongsToLayout || button.isVisible === false) continue;
      const width = Math.abs(Number(button.width) || 0);
      const height = Math.abs(Number(button.height) || 0);
      const originX = Number.isFinite(button.originX) ? button.originX : 0.5;
      const originY = Number.isFinite(button.originY) ? button.originY : 0.5;
      const left = button.x - width * originX;
      const top = button.y - height * originY;
      if (point.x >= left && point.x <= left + width &&
          point.y >= top && point.y <= top + height) return true;
    }
    const areas = this.buttonAreas.get(buttonName) || [];
    return areas.some(area => area.visible && point.x >= area.left && point.x <= area.right &&
      point.y >= area.top && point.y <= area.bottom);
  }

  updateButtonHover(event) {
    const point = this.layoutPoint(event);
    if (!point || typeof point.x !== "number" || typeof point.y !== "number") return;
    const layoutName = this.currentLayoutName();
    for (const buttonName of this.hoverButtonNames) {
      const objectType = this.runtime.objects[buttonName];
      const instances = objectType?.getAllInstances?.() || [];
      for (const button of instances) {
        const inCurrentLayout = button.layer?.layout?.name === layoutName || button.layout?.name === layoutName;
        if (!inCurrentLayout || button.isVisible === false) continue;
        const left = button.x - Math.abs(Number(button.width) || 0) * (Number.isFinite(button.originX) ? button.originX : 0.5);
        const top = button.y - Math.abs(Number(button.height) || 0) * (Number.isFinite(button.originY) ? button.originY : 0.5);
        const hovered = point.x >= left && point.x <= left + Math.abs(button.width) &&
          point.y >= top && point.y <= top + Math.abs(button.height);
        button.animationFrame = hovered ? 1 : 0;
      }
    }
  }

  clearButtonHover() {
    const layoutName = this.currentLayoutName();
    for (const buttonName of this.hoverButtonNames) {
      const instances = this.runtime.objects[buttonName]?.getAllInstances?.() || [];
      for (const button of instances) {
        if (button.layer?.layout?.name === layoutName || button.layout?.name === layoutName) {
          button.animationFrame = 0;
        }
      }
    }
  }

  disableTasDragDrop() {
    const stone = this.runtime.objects.tas?.getFirstInstance?.();
    if (!stone?.behaviors) return;
    for (const [name, behavior] of Object.entries(stone.behaviors)) {
      if (name.toLowerCase().includes("drag") && behavior) {
        behavior.isEnabled = false;
      }
    }
  }

  handlePointer(event) {
    // Try again on the first user gesture if the browser blocked autoplay at
    // startup. The track itself is shared by all layouts and is not restarted
    // here when it is already playing.
    if (!this.backgroundMusicPaused && !this.backgroundMusicStarted) {
      this.syncBackgroundMusic();
    }
    const now = performance.now();
    if (now - this.lastHandledAt < 150) return;
    const route = this.routes[this.currentLayoutName()];
    if (!route) return;
    if (this.buttonAreaLayout !== this.currentLayoutName() || this.buttonAreas.size === 0) {
      this.refreshButtonHitAreas();
    }
    const point = this.layoutPoint(event);
    if (!point || typeof point.x !== "number" || typeof point.y !== "number") return;
    for (const [buttonName, destination] of Object.entries(route)) {
      if (this.hitButtonArea(buttonName, point)) {
        if (buttonName === "btn_play") this.disableTasDragDrop();
        // Once a stone has been thrown, the throw button stays locked until
        // the current question and hopscotch return sequence are complete.
        if (buttonName === "btn_tas_at" && this.runtime.__sekSekGame?.throwButtonBlocked) return;
        this.lastHandledAt = now;
        this.goTo(destination);
        return;
      }
    }
  }

  goTo(layoutName) {
    if (layoutName?.startsWith("__")) {
      this.performAction(layoutName);
      return;
    }
    if (!layoutName) return;
    if (layoutName === this.currentLayoutName()) {
      // The information buttons stay on the same layout but change Sprite3's
      // page.  Apply the pending frame immediately instead of returning
      // before the normal layout-start callback can run.
      this.syncGameOverlay();
      this.refreshButtonHitAreas();
      this.applyPendingPageFrame();
      return;
    }
    // Dispose the previous game controller before opening oyun.  Otherwise
    // an old requestAnimationFrame/return animation can still write to its
    // stale tas instance during the first frame of the new layout.
    if (layoutName === "oyun") {
      this.runtime.__sekSekGame?.dispose?.();
      this.runtime.__sekSekGame = null;
    }
    this.syncGameOverlay(false);
    this.runtime.goToLayout(layoutName);
    setTimeout(() => {
      this.syncGameOverlay();
      this.refreshButtonHitAreas();
      this.applyPendingPageFrame();
    }, 0);
    if (this.pendingSprite3Frame !== undefined) {
      [50, 150, 300].forEach(delay => setTimeout(() => this.applyPendingPageFrame(), delay));
    }
  }

  performAction(action) {
    const canvas = this.runtime.canvas || document.querySelector("canvas");
    if (action === "__start_game") {
      const activeLayout = this.currentLayoutName();
      const controller = this.runtime.__sekSekGame;
      const controllerLayout = controller?.layoutName || controller?.runtime?.layout?.name || "";
      const activeStone = this.runtime.objects.tas?.getFirstInstance?.();
      // Rebind the game controller whenever the game layout was reopened.
      // This prevents the throw button from calling startStage() on a stale
      // controller whose stone belonged to an earlier layout instance.
      if (activeLayout !== "oyun" || !activeStone || controllerLayout !== "oyun" || controller?.stone !== activeStone) {
        controller?.dispose?.();
        this.runtime.__sekSekGame = new SekSekStages(this.runtime);
      }
      this.runtime.__sekSekGame?.startStage?.();
      return;
    }
    if (action === "__fullscreen") {
      canvas?.requestFullscreen?.();
      this.syncFullscreenButtons(true);
      return;
    }
    if (action === "__exit_fullscreen") {
      document.exitFullscreen?.();
      this.syncFullscreenButtons(false);
      return;
    }
    if (action === "__sound_on") {
      this.setProjectAudioMuted(false);
      return;
    }
    if (action === "__sound_off") {
      this.setProjectAudioMuted(true);
      return;
    }
    if (action === "__info_page") {
      this.pendingSprite3Frame = 0;
      this.goTo("bilgi");
      return;
    }
    if (action === "__references_page") {
      this.pendingSprite3Frame = 1;
      this.goTo("bilgi");
      return;
    }
    if (action === "__produced_page") {
      this.pendingSprite3Frame = 2;
      this.goTo("bilgi");
    }
  }

  applyPendingPageFrame() {
    if (this.currentLayoutName() !== "bilgi" || this.pendingSprite3Frame === undefined) return;
    const frame = this.pendingSprite3Frame;
    const sprites = this.runtime.objects.Sprite3?.getAllInstances?.() || [];
    if (!sprites.length) return;
    for (const sprite of sprites) {
      // animationName is read-only in Construct 3. The object already uses
      // Animation 1, so only the frame needs to be changed.
      sprite.animationFrame = frame;
      sprite.isVisible = true;
    }
    console.info(`[Navigation] bilgi/Sprite3 frame ${frame} aktif edildi`);
    this.pendingSprite3Frame = undefined;
  }

  syncBackgroundMusic() {
    if (this.backgroundMusicPaused) return;
    // Keep one source alive while navigating between layouts. This prevents
    // overlap and lets the music continue instead of waiting for a button or
    // answer click before it becomes audible again.
    if (this.backgroundAudioSource || this.backgroundMusicStarting) return;
    this.startBackgroundMusic(0);
  }

  setProjectAudioMuted(muted) {
    this.audioMuted = muted;
    this.backgroundMusicPaused = muted;
    const audio = this.runtime.objects.Audio || this.runtime.audio;
    if (audio) audio.isSilent = muted;
    if (muted) {
      this.backgroundMusicRequestId++;
      try { this.backgroundAudioSource?.stop(); } catch (_) {}
      this.backgroundAudioSource = null;
      this.backgroundMusicStarted = false;
    } else {
      this.syncBackgroundMusic();
    }
    this.syncAudioButtons();
  }

  stopAudioBeforeLayoutChange() {
    this.backgroundMusicRequestId++;
    const audio = this.runtime.objects.Audio;
    try { audio?.stopAll?.(); } catch (_) {}
    try { this.backgroundAudioSource?.stop(); } catch (_) {}
    this.backgroundAudioSource = null;
    this.backgroundMusicStarted = false;
  }

  async loadBackgroundAudio() {
    const buffer = await this.loadAudioBuffer("fon.webm");
    this.backgroundAudioBuffer = buffer;
    return buffer;
  }

  async loadAudioBuffer(fileName) {
    if (this.effectAudioBuffers.has(fileName)) return this.effectAudioBuffers.get(fileName);
    if (this.effectAudioLoading.has(fileName)) return this.effectAudioLoading.get(fileName);
    const audioObject = this.runtime.objects.Audio;
    const audioContext = audioObject?.audioContext;
    if (!audioContext) return null;
    const loading = (async () => {
      const url = await this.runtime.assets.getMediaFileUrl(fileName);
      const response = await fetch(url);
      const data = await response.arrayBuffer();
      const buffer = await audioContext.decodeAudioData(data);
      this.effectAudioBuffers.set(fileName, buffer);
      return buffer;
    })().finally(() => { this.effectAudioLoading.delete(fileName); });
    this.effectAudioLoading.set(fileName, loading);
    return loading;
  }

  async playSoundEffect(fileName) {
    if (this.backgroundMusicPaused) return;
    const audioObject = this.runtime.objects.Audio;
    const audioContext = audioObject?.audioContext;
    const destination = audioObject?.destinationNode;
    if (!audioContext || !destination) return;
    try {
      await audioContext.resume();
      const buffer = await this.loadAudioBuffer(fileName);
      if (!buffer || this.backgroundMusicPaused) return;
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.loop = false;
      source.connect(destination);
      source.start(0);
    } catch (_) {}
  }

  async startBackgroundMusic(offset = 0) {
    if (this.backgroundMusicStarting || this.backgroundAudioSource) return;
    this.backgroundMusicStarting = true;
    const requestId = ++this.backgroundMusicRequestId;
    const audioObject = this.runtime.objects.Audio;
    const audioContext = audioObject?.audioContext;
    const destination = audioObject?.destinationNode;
    if (!audioContext || !destination) {
      this.backgroundMusicStarting = false;
      return;
    }
    try {
      await audioContext.resume();
      const buffer = await this.loadBackgroundAudio();
      if (!buffer || this.backgroundMusicPaused || requestId !== this.backgroundMusicRequestId) return;
      if (this.backgroundAudioSource) {
        try { this.backgroundAudioSource.stop(); } catch (_) {}
      }
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(destination);
      source.start(0, Math.max(0, offset % buffer.duration));
      this.backgroundAudioSource = source;
      this.backgroundAudioStartTime = audioContext.currentTime - offset;
      this.backgroundAudioOffset = offset;
      this.backgroundMusicStarted = true;
    } catch (_) {
      this.backgroundMusicStarted = false;
    } finally {
      this.backgroundMusicStarting = false;
    }
  }

  pauseBackgroundMusic() {
    const audioContext = this.runtime.objects.Audio?.audioContext;
    if (audioContext && this.backgroundAudioBuffer && this.backgroundAudioSource) {
      this.backgroundAudioOffset = (audioContext.currentTime - this.backgroundAudioStartTime) % this.backgroundAudioBuffer.duration;
    }
    this.backgroundMusicPaused = true;
    try { this.backgroundAudioSource?.stop(); } catch (_) {}
    this.backgroundAudioSource = null;
    this.backgroundMusicStarted = false;
    this.syncAudioButtons();
  }

  resumeBackgroundMusic() {
    this.backgroundMusicPaused = false;
    // Resume from the saved position in whichever layout is currently open.
    // The track is intentionally not restricted to kapak after navigation.
    this.startBackgroundMusic(this.backgroundAudioOffset);
    this.syncAudioButtons();
  }

  syncAudioButtons() {
    const layoutName = this.currentLayoutName();
    const pauseButton = this.currentLayoutInstance("btn_sesac");
    const resumeButton = this.currentLayoutInstance("btn_seskapat");
    if (!pauseButton && !resumeButton) return;
    if (!this.audioButtonPositions.has(layoutName)) {
      this.audioButtonPositions.set(layoutName, {
        pauseX: pauseButton?.x ?? resumeButton.x,
        pauseY: pauseButton?.y ?? resumeButton.y,
        resumeX: resumeButton?.x ?? pauseButton.x,
        resumeY: resumeButton?.y ?? pauseButton.y
      });
    }
    const original = this.audioButtonPositions.get(layoutName);
    if (this.backgroundMusicPaused) {
      if (resumeButton) {
        resumeButton.x = original.pauseX;
        resumeButton.y = original.pauseY;
        resumeButton.isVisible = true;
      }
      if (pauseButton) pauseButton.isVisible = false;
    } else {
      if (pauseButton) {
        pauseButton.x = original.pauseX;
        pauseButton.y = original.pauseY;
        pauseButton.isVisible = true;
      }
      if (resumeButton) {
        resumeButton.x = original.resumeX;
        resumeButton.y = original.resumeY;
        resumeButton.isVisible = false;
      }
    }
    this.refreshButtonHitAreas();
  }

  syncFullscreenButtons(isFullscreen) {
    const layoutName = this.currentLayoutName();
    const expand = this.currentLayoutInstance("btn_ekrankapla");
    const minimize = this.currentLayoutInstance("btn_ekranikucult");
    if (!expand || !minimize) return;
    if (!this.fullscreenButtonPositions.has(layoutName)) {
      this.fullscreenButtonPositions.set(layoutName, {
        expandX: expand.x,
        expandY: expand.y,
        minimizeX: minimize.x,
        minimizeY: minimize.y
      });
    }
    const original = this.fullscreenButtonPositions.get(layoutName);
    if (isFullscreen) {
      minimize.x = expand.x;
      minimize.y = expand.y;
      minimize.isVisible = true;
      expand.isVisible = false;
    } else {
      expand.x = original.expandX;
      expand.y = original.expandY;
      minimize.x = original.minimizeX;
      minimize.y = original.minimizeY;
      expand.isVisible = true;
      minimize.isVisible = false;
    }
    this.refreshButtonHitAreas();
  }

  syncGameOverlay(isGameLayout = this.currentLayoutName() === "oyun") {
    const game = this.runtime.__sekSekGame;
    if (game?.statusElement) game.statusElement.style.display = "none";
    if (game?.throwButtonOverlay) {
      game.throwButtonOverlay.style.display = isGameLayout ? "block" : "none";
      const buttonEnabled = isGameLayout && !game.throwButtonBlocked;
      game.throwButtonOverlay.disabled = !buttonEnabled;
      game.throwButtonOverlay.style.pointerEvents = buttonEnabled ? "auto" : "none";
    }
    // Keep the game home button visible; it belongs to the layout UI and is
    // independent from the question/stone container.
    if (isGameLayout) {
      const homeButton = this.currentLayoutInstance("btn_home");
      if (homeButton) homeButton.isVisible = true;
    }
    this.syncFullscreenButtons(false);
  }
}
