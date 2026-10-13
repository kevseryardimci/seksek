// 8-stage stone placement controller. Questions and jumping are intentionally omitted for now.
// Module-level score storage survives layout changes and is mirrored to the
// runtime as well, so the final layout never depends on an old Text_score
// instance reference.
let savedGameScore = 0;
export function getSavedGameScore() { return savedGameScore; }
export class SekSekStages {
  constructor(runtime) {
    this.runtime = runtime;
    // Keep track of the layout from which this controller was created.  A
    // controller created on a previous layout must not be reused after the
    // game layout is opened again, because its instance references are stale.
    this.layoutName = (() => {
      try { return runtime.layout?.name || ""; } catch (_) { return ""; }
    })();
    this.board = runtime.objects.seksek_game?.getFirstInstance();
    this.stone = runtime.objects.tas?.getFirstInstance();
    this.stageStone = runtime.objects.tas4?.getFirstInstance();
    this.specialQuestionSprites = new Map([
      [4, runtime.objects.soru4?.getFirstInstance()],
      [14, runtime.objects.soru14?.getFirstInstance()],
      [31, runtime.objects.soru31?.getFirstInstance()],
      [28, runtime.objects.soru28?.getFirstInstance()]
    ]);
    for (const sprite of this.specialQuestionSprites.values()) {
      if (sprite) sprite.isVisible = false;
    }
    this.questions = runtime.objects.sorular?.getFirstInstance();
    this.questionNumber = runtime.objects.soruno?.getFirstInstance();
    this.scoreText = runtime.objects.Text_score?.getFirstInstance();
    if (!Number.isFinite(Number(runtime.__sekSekScore))) {
      const initialScore = Number.parseInt(String(this.scoreText?.text ?? "0").replace(/[^0-9-]/g, ""), 10);
      runtime.__sekSekScore = Number.isFinite(initialScore) ? initialScore : 0;
      savedGameScore = runtime.__sekSekScore;
    }
    this.stepsGuide = runtime.objects.adimlar?.getFirstInstance();
    this.rightFoot = runtime.objects.sag_ayak?.getFirstInstance();
    this.leftFoot = runtime.objects.sol_ayak?.getFirstInstance();
    this.initialRightFoot = this.rightFoot ? {
      x: this.rightFoot.x,
      y: this.rightFoot.y,
      angle: this.rightFoot.angle
    } : null;
    this.initialLeftFoot = this.leftFoot ? {
      x: this.leftFoot.x,
      y: this.leftFoot.y,
      angle: this.leftFoot.angle
    } : null;
    this.answerBackground = runtime.objects.cvofon1?.getFirstInstance();
    this.answerBackgrounds = [1, 2, 3, 4].map(i => runtime.objects[`cvofon${i}`]?.getFirstInstance()).filter(Boolean);
    this.answerSprites = Array.from({ length: 32 }, (_, i) => runtime.objects[`cvp${i + 1}`]?.getFirstInstance()).filter(Boolean);
    this.correctFeedback = runtime.objects.dogrutik?.getFirstInstance();
    this.wrongFeedback = runtime.objects.yanlis?.getFirstInstance();
    this.optionInstances = [];
    this.answerTimer1 = null;
    this.answerTimer2 = null;
    this.feedbackOrigins = new Map();
    this.stepTimer = null;
    this.stepAnimationFrame = null;
    this.stoneReturnFrame = null;
    this.stonePausePointIndex = null;
    this.stoneReturnTriggered = false;
    this.stepIndex = 0;
    this.stepsActive = false;
    this.throwButtonBlocked = false;
    this.finalTransitionScheduled = false;
    this.answerLocked = false;
    this.questionBackground = runtime.objects.sorufon?.getFirstInstance();
    this.stageContainer = this.stageStone ? [this.stageStone, ...this.stageStone.getOtherContainerInstances()] : [];
    this.throwButton = runtime.objects.btn_tas_at?.getFirstInstance();
    this.stage = 0;
    this.totalQuestions = 8;
    // Construct frame indices are 0..32. Frame 0 is reserved, so the
    // available question pool is 1..32; only the first 8 shuffled items run.
    this.questionFrameOrder = Array.from({ length: 32 }, (_, i) => i + 1);
    for (let i = this.questionFrameOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.questionFrameOrder[i], this.questionFrameOrder[j]] = [this.questionFrameOrder[j], this.questionFrameOrder[i]];
    }
    this.questionFrameIndex = 0;
    this.throwStarted = false;
    this.flying = false;
    this.flightTime = 0;
    this.flightDuration = 0.75;
    this.flightStart = null;
    this.flightTarget = null;
    this.scaling = false;
    this.scaleTime = 0;
    this.scaleDuration = 1.0;
    this.start = { x: this.stone?.x ?? 1319, y: this.stone?.y ?? 986 };
    if (this.questions) this.questions.isVisible = false;
    for (const answer of this.answerSprites) answer.isVisible = false;
    if (this.correctFeedback) this.correctFeedback.isVisible = false;
    if (this.wrongFeedback) this.wrongFeedback.isVisible = false;
    this.normalStoneSize = this.stone ? { width: this.stone.width, height: this.stone.height } : { width: 139, height: 104 };
    this.normalQuestionSize = this.questions ? { width: this.questions.width, height: this.questions.height } : null;
    // The sorular animation frames do not all share one canvas size.  Keep
    // the source dimensions from sorular.json so Construct cannot stretch a
    // short frame to the dimensions of frame 0.
    this.questionFrameSizes = [
      [764,234], [763,129], [755,178], [626,125], [463,40], [621,81],
      [711,81], [610,123], [723,81], [745,118], [820,81], [833,178],
      [730,81], [683,81], [696,133], [699,125], [445,81], [725,125],
      [619,118], [592,37], [685,81], [736,125], [541,81], [767,37],
      [729,118], [606,116], [703,159], [781,70], [702,29], [651,194],
      [796,77], [463,40], [544,117]
    ];
    this.containerOffsets = this.stageContainer.map(instance => ({
      instance,
      x: instance.x - (this.stageStone?.x ?? 0),
      y: instance.y - (this.stageStone?.y ?? 0),
      width: instance.width,
      height: instance.height
    }));
    this.containerScaling = false;
    this.containerScaleTime = 0;
    this.containerScaleDuration = 1.0;
    for (const item of this.stageContainer) item.isVisible = false;
    const dragDrop = this.stone?.behaviors?.DragDrop;
    if (dragDrop) dragDrop.isEnabled = false;
    this.createStatus();
    // Listen on the actual game canvas so this works in both preview and export.
    const canvas = runtime.canvas || document.querySelector("canvas");
    canvas?.addEventListener("pointerup", e => this.pointerDown(e));
    document.addEventListener("pointerup", e => this.pointerDown(e), true);
    this.resetStone();
  }
  createStatus() {
    const canvas = this.runtime.canvas || document.querySelector("canvas");
    if (!canvas?.parentElement) return;
    const parent = canvas.parentElement;
    parent.style.position ||= "relative";
    this.statusElement = document.createElement("div");
    this.statusElement.style.cssText = "display:none;position:absolute;left:50%;top:3%;transform:translateX(-50%);z-index:20;pointer-events:none;padding:10px 22px;border-radius:16px;background:rgba(23,37,84,.88);color:#fff;font:700 22px Arial,sans-serif;text-align:center;min-width:340px";
    parent.appendChild(this.statusElement);

    // Reliable click target over btn_tas_at (layout: 1920x1080).
    // It is transparent, so the prepared Construct artwork remains visible.
    this.throwButtonOverlay = document.createElement("button");
    this.throwButtonOverlay.type = "button";
    this.throwButtonOverlay.setAttribute("aria-label", "Taş at");
    this.throwButtonOverlay.style.cssText = "position:absolute;left:73.7%;top:83.3%;width:21.4%;height:17.1%;z-index:21;opacity:0;cursor:pointer;border:0;padding:0;background:transparent;pointer-events:auto";
    this.throwButtonOverlay.addEventListener("click", event => { event.stopPropagation(); this.startStage(); });
    parent.appendChild(this.throwButtonOverlay);
  }
  layoutPoint(e) {
    const canvas = this.runtime.canvas || document.querySelector("canvas");
    const r = canvas?.getBoundingClientRect?.() || this.runtime.getCanvasClientRect?.();
    // Construct pointer events normally expose layout coordinates already.
    // Browser pointer/touch events expose client coordinates instead, which
    // must be converted from the displayed 1920x1080 canvas, including any
    // aspect-ratio letterboxing.
    if (typeof e.x === "number" && typeof e.clientX !== "number") {
      return { x:e.x, y:e.y };
    }
    const clientX = typeof e.clientX === "number" ? e.clientX : e.x;
    const clientY = typeof e.clientY === "number" ? e.clientY : e.y;
    if (!r || !r.width || !r.height) return { x:clientX, y:clientY };
    const gameWidth = 1920;
    const gameHeight = 1080;
    const scale = Math.min(r.width / gameWidth, r.height / gameHeight);
    const drawnWidth = gameWidth * scale;
    const drawnHeight = gameHeight * scale;
    const offsetX = (r.width - drawnWidth) / 2;
    const offsetY = (r.height - drawnHeight) / 2;
    return {
      x:(clientX - r.left - offsetX) / scale,
      y:(clientY - r.top - offsetY) / scale
    };
  }
  hit(o,p) {
    if (!o) return false;
    if (typeof o.containsPoint === "function" && o.containsPoint(p.x,p.y)) return true;
    const left=o.x-o.width*(o.originX ?? .5), top=o.y-o.height*(o.originY ?? .5);
    return p.x>=left && p.x<=left+o.width && p.y>=top && p.y<=top+o.height;
  }
  hitPlacedAnswer(option, point) {
    const area = option?.answerHitArea;
    if (!area) return false;
    return point.x >= area.left && point.x <= area.right &&
      point.y >= area.top && point.y <= area.bottom;
  }
  imagePoint() {
    let p = null;
    try { p = this.board?.getImagePoint?.(`Image point ${this.stage+1}`); } catch (_) {}
    if (!p) {
      try { p = this.board?.getImagePoint?.(this.stage); } catch (_) {}
    }
    if (Array.isArray(p)) return { x:p[0], y:p[1] };
    if (p && typeof p.x === "number") return p;
    // Fallback coordinates copied from seksek_game's eight image points.
    // This keeps the mechanic working in runtimes where getImagePoint is unavailable.
    const fractions = [[.4885,.9139],[.4732,.7505],[.4855,.5893],[.2374,.4281],[.755,.4303],[.5069,.2647],[.2435,.0948],[.755,.1013]];
    if (this.board) {
      const [x,y] = fractions[this.stage];
      return { x:this.board.x-this.board.width*this.board.originX+x*this.board.width, y:this.board.y-this.board.height*this.board.originY+y*this.board.height };
    }
    return this.start;
  }
  pointerDown(e) {
    const p = this.layoutPoint(e);
    if (this.checkAnswer(p)) return;
    if (this.hit(this.throwButton,p)) { this.startStage(); return; }
  }
  handleRuntimePointer(e) {
    // Touch plugin input is forwarded by Construct as a runtime pointer event.
    // Only the button hit-test is allowed to start a new question.
    if (!e || (typeof e.x !== "number" && typeof e.clientX !== "number")) return;
    this.pointerDown(e);
  }
  startStage() {
    // There are exactly eight questions/stages. Once the eighth question has
    // been created, the throw button cannot start a ninth one.
    if (this.stage > this.totalQuestions - 1 || this.questionFrameIndex >= this.totalQuestions ||
        this.flying || this.stepsActive || this.throwButtonBlocked) return;
    this.setThrowButtonEnabled(false);
    this.clearStepTimer();
    this.clearAnswerTimers();
    this.showRandomQuestionFrame();
    this.advanceQuestionNumber();
    this.answerLocked = false;
    if (this.statusElement) this.statusElement.style.background = "rgba(23,37,84,.88)";
    if (this.correctFeedback) this.correctFeedback.isVisible = false;
    if (this.wrongFeedback) this.wrongFeedback.isVisible = false;
    if (this.questions) this.questions.isVisible = false;
    for (const answer of this.answerSprites) answer.isVisible = false;
    for (const option of this.optionInstances) option.isVisible = false;
    this.throwStarted=true;
    this.flying=true;
    this.flightTime=0;
    this.flightStart={x:this.start.x,y:this.start.y};
    this.flightTarget=this.imagePoint();
    console.info(`[SekSek] Kademe ${this.stage+1} başladı`, this.flightStart, this.flightTarget);
    this.status(`Kademe ${this.stage+1}: Taş atılıyor...`);
    this.lastFrameTime=performance.now();
    requestAnimationFrame(time => this.animate(time));
  }
  showRandomQuestionFrame() {
    if (!this.questions) return;
    // Pick 8 different frames from the shuffled 1..32 question pool.
    const index = Math.min(this.questionFrameIndex, this.totalQuestions - 1);
    this.questions.animationFrame = this.questionFrameOrder[index];
    this.restoreQuestionSize();
    this.questionFrameIndex = Math.min(this.questionFrameIndex + 1, this.totalQuestions);
    this.currentQuestionFrame = this.questions.animationFrame;
    // Place the matching answer as soon as the question is selected.
    // It remains hidden until the question itself is shown with tas4.
    this.positionMatchingAnswer();
  }
  showQuestion() {
    if (!this.questions) return;
    this.anchorQuestion();
    this.restoreQuestionSize();
    this.questions.isVisible = true;
    this.showSpecialQuestionSprite();
    this.showMatchingAnswer();
  }
  restoreQuestionSize() {
    if (!this.questions) return;
    const size = this.getCurrentQuestionFrameSize();
    if (!size) return;
    // Each sorular frame has its own source dimensions.  Use those dimensions
    // instead of forcing frame 0's ratio onto every other frame.
    this.questions.width = size.width;
    this.questions.height = size.height;
  }
  getCurrentQuestionFrameSize() {
    if (!this.questions) return null;
    const frame = Number(this.questions.animationFrame) || 0;
    const sourceSize = this.questionFrameSizes?.[frame];
    if (sourceSize) return { width: sourceSize[0], height: sourceSize[1] };
    let size = null;
    try {
      size = this.questions.getAnimationFrameImageSize?.("Animation 1", frame);
    } catch (_) {}
    if (Array.isArray(size) && size.length >= 2) {
      return { width: size[0], height: size[1] };
    }
    if (size && Number.isFinite(size.width) && Number.isFinite(size.height)) {
      return { width: size.width, height: size.height };
    }
    return this.normalQuestionSize;
  }
  getTas4ImagePoint1() {
    if (!this.stageStone) return null;
    let point = null;
    for (const name of ["Image point 1", "imagepoint1", "imagepoint 1"]) {
      try {
        point = this.stageStone.getImagePoint?.(name);
      } catch (_) {}
      if (point) break;
    }
    if (Array.isArray(point)) return { x: point[0], y: point[1] };
    if (point && typeof point.x === "number" && typeof point.y === "number") return point;
    return null;
  }
  positionSpecialQuestionSprite() {
    const sprite = this.specialQuestionSprites.get(this.currentQuestionFrame);
    if (!sprite || !this.stageStone) return;
    const point = this.getTas4ImagePoint1();
    if (!point) return;
    sprite.x = point.x;
    sprite.y = point.y;
  }
  showSpecialQuestionSprite() {
    for (const sprite of this.specialQuestionSprites.values()) {
      if (sprite) sprite.isVisible = false;
    }
    const sprite = this.specialQuestionSprites.get(this.currentQuestionFrame);
    if (!sprite) return;
    this.positionSpecialQuestionSprite();
    sprite.isVisible = true;
  }
  anchorQuestion() {
    if (!this.questions || !this.questionBackground) return;
    let point = null;
    try { point = this.questionBackground.getImagePoint?.("Image point 1"); } catch (_) {}
    if (!point) {
      try { point = this.questionBackground.getImagePoint?.(0); } catch (_) {}
    }
    if (Array.isArray(point)) {
      this.questions.x = point[0];
      this.questions.y = point[1];
    } else if (point && typeof point.x === "number") {
      this.questions.x = point.x;
      this.questions.y = point.y;
    }
  }
  showMatchingAnswer() {
    for (const answer of this.answerSprites) answer.isVisible = false;
    for (const option of this.optionInstances) option.isVisible = false;
    this.showMatchingAnswers();
  }
  checkAnswer(point) {
    if (this.flying || this.answerLocked) return false;
    // Resolve only the placed cvpN/frame hit area.  The cvofon backgrounds
    // are not used for answer selection, so a neighbouring row cannot be
    // selected because of background overlap.
    const optionUnderPointer = this.optionInstances.find(item =>
      item.isVisible !== false && this.hitPlacedAnswer(item, point)
    );
    const option = optionUnderPointer;
    if (!option) return false;
    // Only the first option click is accepted for the current question.
    this.answerLocked = true;
    if (option.animationFrame === 0) {
      this.showFeedback(this.correctFeedback, option);
      this.increaseScore(10);
      this.status("Doğru cevap! Harika iş çıkardın.");
      if (this.statusElement) this.statusElement.style.background = "rgba(22,163,74,.92)";
      this.answerTimer1 = setTimeout(() => {
        this.hideStageQuestion();
      }, 1000);
    } else {
      this.showFeedback(this.wrongFeedback, option);
      this.status("Yanlış cevap. Tekrar dene.");
      if (this.statusElement) this.statusElement.style.background = "rgba(220,38,38,.92)";
      const correctOption = this.optionInstances.find(item =>
        item.animationFrame === 0 && item.isVisible !== false
      );
      // Show the correct answer feedback immediately, without hiding the
      // wrong-answer feedback. Both remain visible for the same one-second
      // result interval.
      if (correctOption) this.showFeedback(this.correctFeedback, correctOption, false);
      this.answerTimer1 = setTimeout(() => {
        this.hideStageQuestion();
      }, 1000);
    }
    return true;
  }
  increaseScore(amount) {
    if (!this.scoreText) return;
    const current = Number.parseInt(String(this.scoreText.text ?? "0").replace(/[^0-9-]/g, ""), 10);
    const nextScore = (Number.isFinite(current) ? current : 0) + amount;
    this.scoreText.text = String(nextScore);
    // Keep the score available while Construct changes from oyun to final.
    this.runtime.__sekSekScore = nextScore;
    savedGameScore = nextScore;
  }
  clearAnswerTimers() {
    if (this.answerTimer1 !== null) clearTimeout(this.answerTimer1);
    if (this.answerTimer2 !== null) clearTimeout(this.answerTimer2);
    this.answerTimer1 = null;
    this.answerTimer2 = null;
  }
  hideStageQuestion() {
    this.clearAnswerTimers();
    this.containerScaling = false;
    for (const item of this.stageContainer) item.isVisible = false;
    for (const sprite of this.specialQuestionSprites.values()) {
      if (sprite) sprite.isVisible = false;
    }
    if (this.questions) this.questions.isVisible = false;
    for (const answer of this.answerSprites) answer.isVisible = false;
    for (const option of this.optionInstances) option.isVisible = false;
    if (this.correctFeedback) this.correctFeedback.isVisible = false;
    if (this.wrongFeedback) this.wrongFeedback.isVisible = false;
    this.activeFeedback = null;
    this.feedbackOption = null;
    this.feedbackOrigin = null;
    this.feedbackOrigins.clear();
    if (this.questionFrameIndex >= this.totalQuestions) {
      if (this.throwButtonOverlay) {
        this.throwButtonOverlay.disabled = true;
        this.throwButtonOverlay.style.pointerEvents = "none";
      }
      this.status("8 soru tamamlandı.");
    }
    this.startHopscotchSteps();
  }
  clearStepTimer() {
    if (this.stepTimer !== null) clearTimeout(this.stepTimer);
    this.stepTimer = null;
    if (this.stepAnimationFrame !== null) cancelAnimationFrame(this.stepAnimationFrame);
    this.stepAnimationFrame = null;
    if (this.stoneReturnFrame !== null) cancelAnimationFrame(this.stoneReturnFrame);
    this.stoneReturnFrame = null;
  }
  getStepPoint(index) {
    if (!this.stepsGuide) return null;
    let point = null;
    try { point = this.stepsGuide.getImagePoint?.(`Image point ${index + 1}`); } catch (_) {}
    if (Array.isArray(point)) return { x: point[0], y: point[1] };
    if (point && typeof point.x === "number" && typeof point.y === "number") return point;
    return null;
  }
  startHopscotchSteps() {
    this.clearStepTimer();
    if (!this.stepsGuide || !this.rightFoot) return;
    this.stepsActive = true;
    this.setThrowButtonEnabled(false);
    this.stepsGuide.isVisible = true;
    this.rightFoot.isVisible = true;
    if (this.leftFoot) this.leftFoot.isVisible = false;
    // Forward right foot: 1 -> 2 -> 3 -> 5 -> 6 -> 8.
    // Return right foot: 10 -> 11 -> 13 -> 14 -> 15 -> 16.
    // The left foot is placed separately on 4, 7, 9 and 12.
    this.stepTargets = [0, 1, 2, 4, 5, 7, 9, 10, 12, 13, 14, 15];
    const firstPoint = this.getStepPoint(this.stepTargets[0]);
    if (!firstPoint) return;
    this.rightFoot.x = firstPoint.x;
    this.rightFoot.y = firstPoint.y;
    this.stepIndex = 1;
    this.stonePausePointIndex = this.findStoneReturnPoint();
    this.stoneReturnTriggered = false;
    // Stay on imagepoint1 for 0.3 seconds before the first jump.
    this.stepTimer = setTimeout(() => {
      this.stepTimer = null;
      this.animateNextFootStep();
    }, 300);
  }
  animateNextFootStep() {
    if (!this.rightFoot || this.stepIndex >= this.stepTargets.length) return;
    // The left foot is visible only at its designated landing points. Hide
    // it immediately when the right foot starts moving to a new point.
    if (this.leftFoot) this.leftFoot.isVisible = false;
    const fromPointIndex = this.stepTargets[this.stepIndex - 1];
    const toPointIndex = this.stepTargets[this.stepIndex];
    const from = this.getStepPoint(fromPointIndex);
    const to = this.getStepPoint(toPointIndex);
    if (!from || !to) return;
    const startTime = performance.now();
    const duration = 300;
    const jumpHeight = 85;
    const animate = now => {
      const t = Math.min(1, Math.max(0, (now - startTime) / duration));
      // Constant-gravity jump arc: the foot rises and falls under a
      // parabolic trajectory while moving between two image points.
      this.rightFoot.x = from.x + (to.x - from.x) * t;
      this.rightFoot.y = from.y + (to.y - from.y) * t - 4 * jumpHeight * t * (1 - t);
      if (t < 1) {
        this.stepAnimationFrame = requestAnimationFrame(animate);
        return;
      }
      this.rightFoot.x = to.x;
      this.rightFoot.y = to.y;
      // Play the footstep exactly when sag_ayak lands on the target point.
      this.runtime.__sekSekNavigation?.playSoundEffect?.("ayaksesi.webm");
      const movingForward = this.stepIndex <= 5;
      // On the forward route, show the left foot on imagepoint4 when the
      // right foot lands on imagepoint5.
      if (movingForward && toPointIndex === 4 && this.leftFoot) {
        const leftPoint = this.getStepPoint(3);
        if (leftPoint) {
          this.leftFoot.x = leftPoint.x;
          this.leftFoot.y = leftPoint.y;
          this.leftFoot.isVisible = true;
        }
      } else if (toPointIndex === 5 && this.leftFoot) {
        this.leftFoot.isVisible = false;
      // When the right foot reaches imagepoint8, show the left foot on
      // imagepoint7. The right foot turns after the landing pause below.
      } else if (movingForward && toPointIndex === 7 && this.leftFoot) {
        const leftPoint = this.getStepPoint(6);
        if (leftPoint) {
          this.leftFoot.x = leftPoint.x;
          this.leftFoot.y = leftPoint.y;
          this.leftFoot.isVisible = true;
        }
      // On the return route, right foot imagepoint10 places the left foot on
      // imagepoint9, facing back. Right foot imagepoint13 places the left
      // foot on imagepoint12, also facing back.
      } else if (!movingForward && toPointIndex === 9 && this.leftFoot) {
        const leftPoint = this.getStepPoint(8);
        if (leftPoint) {
          this.leftFoot.x = leftPoint.x;
          this.leftFoot.y = leftPoint.y;
          this.leftFoot.angle = Math.PI;
          this.leftFoot.isVisible = true;
        }
      } else if (!movingForward && toPointIndex === 12 && this.leftFoot) {
        const leftPoint = this.getStepPoint(11);
        if (leftPoint) {
          this.leftFoot.x = leftPoint.x;
          this.leftFoot.y = leftPoint.y;
          this.leftFoot.angle = Math.PI;
          this.leftFoot.isVisible = true;
        }
      }
      this.stepIndex++;
      const shouldReturnStone = !movingForward &&
        !this.stoneReturnTriggered &&
        toPointIndex === this.stonePausePointIndex;
      if (shouldReturnStone) {
        this.stoneReturnTriggered = true;
        this.returnStoneToStart(() => {
          if (this.stepIndex < this.stepTargets.length) {
            this.stepTimer = setTimeout(() => {
              this.stepTimer = null;
              this.animateNextFootStep();
            }, 0);
          } else {
            this.stepTimer = setTimeout(() => {
              this.stepTimer = null;
              this.resetFeetToStart();
            }, 300);
          }
        });
        return;
      }
      if (this.stepIndex < this.stepTargets.length) {
        // Pause on every landed image point for 0.3 seconds before starting
        // the next jump.
        this.stepTimer = setTimeout(() => {
          this.stepTimer = null;
          // Wait on imagepoint8 before changing direction.
          if (toPointIndex === 7 && movingForward) this.rightFoot.angle = Math.PI;
          this.animateNextFootStep();
        }, 300);
      } else {
        this.stepAnimationFrame = null;
        // Keep both feet visible at imagepoint16 for 0.3 seconds before
        // returning them to their original starting positions.
        this.stepTimer = setTimeout(() => {
          this.stepTimer = null;
          this.resetFeetToStart();
        }, 300);
      }
    };
    this.stepAnimationFrame = requestAnimationFrame(animate);
  }
  findStoneReturnPoint() {
    if (!this.stone) return null;
    const returnPointIndices = [9, 10, 12, 13, 14, 15];
    let nearest = null;
    let nearestDistance = Infinity;
    for (const pointIndex of returnPointIndices) {
      const point = this.getStepPoint(pointIndex);
      if (!point) continue;
      const distance = Math.abs(point.y - this.stone.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = pointIndex;
      }
    }
    return nearest;
  }
  returnStoneToStart(onComplete) {
    if (!this.stone) {
      onComplete?.();
      return;
    }
    const from = { x: this.stone.x, y: this.stone.y };
    const to = this.start;
    const startTime = performance.now();
    const duration = 750;
    const arcHeight = 180;
    const animate = now => {
      const t = Math.min(1, Math.max(0, (now - startTime) / duration));
      this.stone.x = from.x + (to.x - from.x) * t;
      this.stone.y = from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * arcHeight;
      if (t < 1) {
        this.stoneReturnFrame = requestAnimationFrame(animate);
        return;
      }
      this.stone.x = to.x;
      this.stone.y = to.y;
      this.stoneReturnFrame = null;
      onComplete?.();
    };
    this.stoneReturnFrame = requestAnimationFrame(animate);
  }
  resetFeetToStart() {
    if (this.rightFoot && this.initialRightFoot) {
      this.rightFoot.x = this.initialRightFoot.x;
      this.rightFoot.y = this.initialRightFoot.y;
      this.rightFoot.angle = this.initialRightFoot.angle;
      this.rightFoot.isVisible = true;
    }
    if (this.leftFoot && this.initialLeftFoot) {
      this.leftFoot.x = this.initialLeftFoot.x;
      this.leftFoot.y = this.initialLeftFoot.y;
      this.leftFoot.angle = this.initialLeftFoot.angle;
      this.leftFoot.isVisible = true;
    }
    this.stepsActive = false;
    if (this.questionFrameIndex < this.totalQuestions) this.setThrowButtonEnabled(true);
    // The final layout is opened only after the eighth question's complete
    // walk has returned both feet to their original positions.
    if (this.stage === this.totalQuestions - 1 &&
        this.questionFrameIndex >= this.totalQuestions &&
        !this.finalTransitionScheduled) {
      this.captureCurrentScore();
      this.finalTransitionScheduled = true;
      setTimeout(() => {
        try {
          if (this.runtime.layout?.name !== "oyun") return;
          const navigation = this.runtime.__sekSekNavigation;
          if (navigation?.goTo) navigation.goTo("final");
          else this.runtime.goToLayout("final");
          // Construct creates the destination layout instances asynchronously.
          // Apply the saved score after the new instances are available.
          [0, 50, 150, 300, 600].forEach(delay => {
            setTimeout(() => this.applyFinalScore(), delay);
          });
        } catch (_) {}
      }, 500);
    }
  }
  setThrowButtonEnabled(enabled) {
    this.throwButtonBlocked = !enabled;
    if (this.throwButtonOverlay) {
      this.throwButtonOverlay.disabled = !enabled;
      this.throwButtonOverlay.style.pointerEvents = enabled ? "auto" : "none";
    }
    if (this.throwButton) {
      this.throwButton.isEnabled = enabled;
      // Disable Construct's actual Touch behavior as well.  The navigation
      // hit-test and the DOM overlay are not the only possible input routes.
      const behaviors = this.throwButton.behaviors || {};
      for (const [name, behavior] of Object.entries(behaviors)) {
        if (name.toLowerCase().includes("touch") && behavior) {
          behavior.isEnabled = enabled;
        }
      }
      if (behaviors.Touch) behaviors.Touch.isEnabled = enabled;
    }
  }
  captureCurrentScore() {
    const current = Number.parseInt(String(this.scoreText?.text ?? "0").replace(/[^0-9-]/g, ""), 10);
    if (!Number.isFinite(current)) return;
    this.runtime.__sekSekScore = current;
    savedGameScore = current;
  }
  applyFinalScore() {
    let score = Number(this.runtime.__sekSekScore);
    if (!Number.isFinite(score)) score = savedGameScore;
    const text = this.runtime.objects.Text_score?.getFirstInstance?.();
    if (text && Number.isFinite(score)) text.text = String(score);
    const medal = this.runtime.objects.madalya?.getFirstInstance?.();
    if (!medal || !Number.isFinite(score)) return;
    medal.animationFrame = score >= 70 ? 0 : score >= 50 ? 1 : score >= 30 ? 2 : 3;
  }
  showFeedback(feedback, option, hideOtherFeedback = true) {
    if (hideOtherFeedback) {
      if (this.correctFeedback) this.correctFeedback.isVisible = false;
      if (this.wrongFeedback) this.wrongFeedback.isVisible = false;
      this.feedbackOrigins.clear();
    }
    if (!feedback || !option) return;
    this.activeFeedback = feedback;
    this.feedbackOption = option;
    // Snapshot the clicked cvpN instance origin.  Do not derive this from
    // the cvofon slot: that can point to the neighbouring answer.
    this.feedbackOrigin = { x: option.x, y: option.y };
    this.feedbackOrigins.set(feedback, this.feedbackOrigin);
    feedback.x = this.feedbackOrigin.x;
    feedback.y = this.feedbackOrigin.y;
    feedback.isVisible = true;
  }
  positionMatchingAnswer(answer, background) {
    if (!answer || !background) return;
    // The imported cvpN frames do not all have the same origin metadata
    // (some have originY values greater than 1).  Normalize the displayed
    // frame so its top-left origin is always the cvofon Image Point 1 anchor.
    // Without this, a frame can visually appear on the row above/below even
    // though its instance x/y values are correct.
    answer.originX = 0;
    answer.originY = 0;
    let point = null;
    try { point = background.getImagePoint?.("Image point 1"); } catch (_) {}
    if (!point) {
      try { point = background.getImagePoint?.(0); } catch (_) {}
    }
    if (Array.isArray(point)) {
      answer.x = point[0]; answer.y = point[1];
    } else if (point && typeof point.x === "number") {
      answer.x = point.x; answer.y = point.y;
    } else {
      answer.x = background.x; answer.y = background.y;
    }
    // Build the click area only after the answer has been placed.  The area
    // therefore follows the displayed frame's actual x/y/width/height and
    // never uses the old layout position or the frame collision polygon.
    if (answer.isAnswerOption) {
      const width = Math.abs(answer.width ?? 0);
      const height = Math.abs(answer.height ?? 0);
      answer.answerHitArea = {
        left: answer.x,
        top: answer.y,
        right: answer.x + width,
        bottom: answer.y + height
      };
    }
  }
  showMatchingAnswers() {
    const source = this.runtime.objects[`cvp${this.currentQuestionFrame}`]?.getFirstInstance();
    const sourceType = this.runtime.objects[`cvp${this.currentQuestionFrame}`];
    const targetLayer = "Layer 0";
    if (!source || this.answerBackgrounds.length === 0) return;
    const frameOrder = [0, 1, 2, 3];
    for (let i = frameOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [frameOrder[i], frameOrder[j]] = [frameOrder[j], frameOrder[i]];
    }
    this.optionInstances = [];
    for (let i = 0; i < Math.min(4, this.answerBackgrounds.length); i++) {
      let option = i === 0 ? source : null;
      if (!option && sourceType?.createInstance) {
        try {
          option = sourceType.createInstance(targetLayer, source.x, source.y);
        } catch (_) {
          try { option = sourceType.createInstance(source.layer, source.x, source.y); } catch (error) { console.error("[SekSek] Cevap instance oluşturulamadı", error); }
        }
      }
      if (!option) continue;
      option.animationFrame = frameOrder[i];
      option.isAnswerOption = true;
      option.answerSlotIndex = i;
      this.positionMatchingAnswer(option, this.answerBackgrounds[i]);
      option.lockedAnswerX = option.x;
      option.lockedAnswerY = option.y;
      option.isVisible = true;
      this.optionInstances.push(option);
    }
  }
  advanceQuestionNumber() {
    if (!this.questionNumber) return;
    this.questionNumber.animationFrame = Math.min(this.questionNumber.animationFrame + 1, 8);
  }
  resetStone(message="Kademe 1 için taşı atma butonuna bas.") { this.throwStarted=false; this.flying=false; this.resetPosition(); this.status(message); }
  resetPosition() { if (this.stone) { this.stone.x=this.start.x; this.stone.y=this.start.y; } }
  status(message) { if (this.statusElement) this.statusElement.textContent=message; }
  animate(time) {
    if (!this.flying || !this.stone || !this.flightStart || !this.flightTarget) return;
    this.flightTime += Math.max(0,time-this.lastFrameTime)/1000;
    this.lastFrameTime=time;
    const t = Math.min(this.flightTime / this.flightDuration, 1);
    // Parabolic arc: equivalent to throwing the stone upward against gravity.
    const arcHeight = 240;
    this.stone.x = this.flightStart.x + (this.flightTarget.x - this.flightStart.x) * t;
    this.stone.y = this.flightStart.y + (this.flightTarget.y - this.flightStart.y) * t - Math.sin(Math.PI * t) * arcHeight;
    if (t >= 1) {
      this.stone.x=this.flightTarget.x;
      this.stone.y=this.flightTarget.y;
      this.runtime.__sekSekNavigation?.playSoundEffect?.("tassesi.webm");
      this.flying=false;
      this.throwStarted=false;
      this.startStoneScaleUp();
      // Replay the same tas4 container entrance effect for every stage.
      this.showStageStone();
      this.showQuestion();
      if (this.stage < 7) { this.stage++; this.status(`Kademe ${this.stage} tamamlandı. Sıradaki taş için butona bas.`); }
      else this.status("8 kademe tamamlandı!");
    } else requestAnimationFrame(nextTime => this.animate(nextTime));
  }
  showStageStone() {
    if (!this.stageStone) return;
    const centerX = 960;
    const centerY = 540;
    const initialScale = 0.25;
    const questionSize = this.getCurrentQuestionFrameSize();
    for (const item of this.containerOffsets) {
      item.instance.x = centerX + item.x * initialScale;
      item.instance.y = centerY + item.y * initialScale;
      if (item.instance === this.questions && questionSize) {
        item.instance.width = questionSize.width;
        item.instance.height = questionSize.height;
      } else {
        item.instance.width = item.width * initialScale;
        item.instance.height = item.height * initialScale;
      }
      item.instance.isVisible = true;
    }
    this.containerScaling = true;
    this.containerScaleTime = 0;
    this.lastContainerScaleFrame = performance.now();
    requestAnimationFrame(time => this.animateContainerScale(time));
  }
  animateContainerScale(time) {
    if (!this.containerScaling) return;
    this.containerScaleTime += Math.max(0, time - this.lastContainerScaleFrame) / 1000;
    this.lastContainerScaleFrame = time;
    const t = Math.min(this.containerScaleTime / this.containerScaleDuration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const scale = 0.25 + 0.75 * eased;
    const questionSize = this.getCurrentQuestionFrameSize();
    for (const item of this.containerOffsets) {
      item.instance.x = 960 + item.x * scale;
      item.instance.y = 540 + item.y * scale;
      if (item.instance === this.questions && questionSize) {
        item.instance.width = questionSize.width;
        item.instance.height = questionSize.height;
      } else {
        item.instance.width = item.width * scale;
        item.instance.height = item.height * scale;
      }
    }
    this.restoreQuestionSize();
    this.positionSpecialQuestionSprite();
    if (this.questions?.isVisible) this.anchorQuestion();
    // Keep the first question's four answer sprites attached while the
    // tas4 container is still scaling into its final position.
    for (const option of this.optionInstances) {
      const background = this.answerBackgrounds[option.answerSlotIndex];
      this.positionMatchingAnswer(option, background);
    }
    this.positionSpecialQuestionSprite();
    if (t >= 1) {
      this.containerScaling = false;
    } else requestAnimationFrame(nextTime => this.animateContainerScale(nextTime));
  }
  startStoneScaleUp() {
    if (!this.stone) return;
    this.scaling = true;
    this.scaleTime = 0;
    this.stone.width = this.normalStoneSize.width * 0.25;
    this.stone.height = this.normalStoneSize.height * 0.25;
    this.lastScaleFrame = performance.now();
    requestAnimationFrame(time => this.animateStoneScale(time));
  }
  animateStoneScale(time) {
    if (!this.scaling || !this.stone) return;
    this.scaleTime += Math.max(0, time - this.lastScaleFrame) / 1000;
    this.lastScaleFrame = time;
    const t = Math.min(this.scaleTime / this.scaleDuration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    this.stone.width = this.normalStoneSize.width * (0.25 + 0.75 * eased);
    this.stone.height = this.normalStoneSize.height * (0.25 + 0.75 * eased);
    if (t >= 1) {
      this.stone.width = this.normalStoneSize.width;
      this.stone.height = this.normalStoneSize.height;
      this.scaling = false;
    } else requestAnimationFrame(nextTime => this.animateStoneScale(nextTime));
  }
  tick() {
    if (this.flying || this.containerScaling) return;
    if (this.questions?.isVisible) this.restoreQuestionSize();
    this.positionSpecialQuestionSprite();
    for (const option of this.optionInstances) {
      const background = this.answerBackgrounds[option.answerSlotIndex];
      if (option.isVisible !== false) this.positionMatchingAnswer(option, background);
    }
    for (const [feedback, origin] of this.feedbackOrigins) {
      if (!feedback.isVisible) continue;
      feedback.x = origin.x;
      feedback.y = origin.y;
    }
  }
}
