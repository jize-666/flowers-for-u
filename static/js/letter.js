import { CONFIG, CONTENT } from "./config.js";

export class LetterController {
  constructor({
    gsap = null,
    reducedMotion = false,
    onFocus = () => {},
    onBlur = () => {},
    onState = () => {},
  } = {}) {
    this.gsap = gsap;
    this.reducedMotion = reducedMotion;
    this.onFocus = onFocus;
    this.onBlur = onBlur;
    this.onState = onState;

    this.status = "closed";
    this.cycle = 0;

    this.events = new AbortController();

    const options = {
      signal: this.events.signal,
    };

    this.dialog = document.querySelector("#letter-dialog");
    this.paper = this.dialog.querySelector(".letter-paper");
    this.backdrop = this.dialog.querySelector(".letter-backdrop");
    this.visual = this.dialog.querySelector(".letter-visual");
    this.text = this.dialog.querySelector("#typed-message");
    this.cursor = this.dialog.querySelector(".typing-cursor");
    this.skip = this.dialog.querySelector("#skip-typing");
    this.closeButton = this.dialog.querySelector("#close-letter");

    this.openTimeline = null;
    this.closeTimeline = null;
    this.typingTween = null;
    this.typingTimer = null;
    this.nativeDelay = null;
    this.cursorFrame = null;
    this.resizeObserver = null;
    this.previousFocus = null;

    this.dialog.querySelector("#letter-title").textContent =
      CONTENT.letterTitle;

    this.dialog.querySelector("#letter-full-message").textContent =
      CONTENT.message;

    this.dialog.querySelector(".letter-layout").textContent =
      CONTENT.message;

    this.dialog.querySelector(".letter-signature").textContent =
      CONTENT.signature;

    this.resetCursor();

    this.closeButton.addEventListener(
      "click",
      () => this.close(),
      options
    );

    this.skip.addEventListener(
      "click",
      () => this.finishTyping(),
      options
    );

    this.dialog.addEventListener(
      "cancel",
      event => {
        event.preventDefault();
        this.close();
      },
      options
    );

    this.backdrop.addEventListener(
      "click",
      () => this.close(),
      options
    );

    window.addEventListener(
      "resize",
      () => this.queueCursorPosition(),
      options
    );

    window.addEventListener(
      "orientationchange",
      () => this.queueCursorPosition(),
      options
    );

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver =
        new ResizeObserver(() => {
          this.queueCursorPosition();
        });

      this.resizeObserver.observe(
        this.visual
      );
    }

    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!this.events.signal.aborted) {
          this.queueCursorPosition();
        }
      });
    }
  }

  setState(status) {
    this.status = status;
    this.onState(status);
    this.dialog.dataset.state = status;
  }

  resetCursor() {
    if (!this.cursor) {
      return;
    }

    if (this.cursorFrame !== null) {
      cancelAnimationFrame(
        this.cursorFrame
      );

      this.cursorFrame = null;
    }

    this.cursor.style.position =
      "absolute";

    this.cursor.style.left =
      "0px";

    this.cursor.style.top =
      "0px";

    this.cursor.style.opacity =
      "0";
  }

  queueCursorPosition() {
    if (
      !this.dialog.open ||
      !this.paper.classList.contains(
        "is-typing"
      )
    ) {
      return;
    }

    if (this.cursorFrame !== null) {
      cancelAnimationFrame(
        this.cursorFrame
      );
    }

    this.cursorFrame =
      requestAnimationFrame(() => {
        this.cursorFrame = null;
        this.positionCursor();
      });
  }

  positionCursor() {
    if (
      !this.dialog.open ||
      !this.cursor ||
      !this.visual
    ) {
      return;
    }

    const node =
      this.text.firstChild;

    if (
      !node ||
      node.nodeType !== Node.TEXT_NODE ||
      node.textContent.length === 0
    ) {
      return;
    }

    const length =
      node.textContent.length;

    const range =
      document.createRange();

    range.setStart(
      node,
      Math.max(0, length - 1)
    );

    range.setEnd(
      node,
      length
    );

    const rects =
      range.getClientRects();

    let rect =
      rects.length > 0
        ? rects[rects.length - 1]
        : range.getBoundingClientRect();

    if (
      !rect ||
      !Number.isFinite(rect.right) ||
      !Number.isFinite(rect.top)
    ) {
      return;
    }

    const parent =
      this.cursor.offsetParent ||
      this.visual;

    const parentRect =
      parent.getBoundingClientRect();

    const cursorStyle =
      getComputedStyle(
        this.cursor
      );

    let cursorHeight =
      parseFloat(
        cursorStyle.height
      );

    if (
      !Number.isFinite(
        cursorHeight
      ) ||
      cursorHeight <= 0
    ) {
      const textStyle =
        getComputedStyle(
          this.visual
        );

      const fontSize =
        parseFloat(
          textStyle.fontSize
        ) || 20;

      cursorHeight =
        fontSize * 0.88;

      this.cursor.style.height =
        `${cursorHeight}px`;
    }

    const rectHeight =
      rect.height > 0
        ? rect.height
        : cursorHeight;

    const left =
      rect.right -
      parentRect.left;

    const top =
      rect.top -
      parentRect.top +
      (
        rectHeight -
        cursorHeight
      ) / 2;

    this.cursor.style.left =
      `${Math.max(0, left)}px`;

    this.cursor.style.top =
      `${Math.max(0, top)}px`;
  }

  updateTypedText(value) {
    this.text.textContent =
      value;

    this.positionCursor();
  }

  open(flower, triggerElement = null) {
    if (this.status !== "closed") {
      return false;
    }

    this.cycle += 1;

    this.previousFocus =
      triggerElement ||
      document.activeElement;

    this.stopAnimations();

    this.text.textContent = "";

    this.resetCursor();

    this.skip.hidden = false;
    this.skip.disabled = true;

    this.paper.classList.remove(
      "is-typing"
    );

    this.dialog.showModal();

    this.paper.scrollTop = 0;

    this.setState("opening");

    this.closeButton.focus({
      preventScroll: true,
    });

    document.body.classList.add(
      "reading-letter"
    );

    if (!this.gsap) {
      this.openNative(flower);
      return true;
    }

    const duration =
      this.reducedMotion
        ? 0.14
        : CONFIG.letter.openDuration;

    this.openTimeline =
      this.gsap.timeline({
        onComplete: () => {
          if (
            this.status ===
            "opening"
          ) {
            this.setState(
              "open"
            );
          }
        },
      });

    this.onFocus(
      this.openTimeline,
      flower
    );

    this.openTimeline.fromTo(
      this.backdrop,
      {
        opacity: 0,
      },
      {
        opacity: 1,
        duration:
          this.reducedMotion
            ? 0.14
            : 0.65,
        ease: "sine.out",
      },
      0
    );

    this.openTimeline.fromTo(
      this.paper,
      {
        autoAlpha: 0,
        y:
          this.reducedMotion
            ? 0
            : 66,
        z:
          this.reducedMotion
            ? 0
            : -80,
        scale:
          this.reducedMotion
            ? 1
            : 0.94,
        rotationX:
          this.reducedMotion
            ? 0
            : 7,
        rotationZ:
          this.reducedMotion
            ? 0
            : -1.2,
      },
      {
        autoAlpha: 1,
        y: 0,
        z: 0,
        scale: 1,
        rotationX: 0,
        rotationZ: 0,
        duration,
        ease: "power3.out",
      },
      0.08
    );

    this.openTimeline.call(
      () => this.beginTyping(),
      [],
      duration +
        0.08 +
        (
          this.reducedMotion
            ? 0
            : CONFIG.letter.typingDelay
        )
    );

    return true;
  }

  async openNative(flower) {
    const cycle = this.cycle;

    this.onFocus(
      null,
      flower
    );

    const duration =
      this.reducedMotion
        ? 140
        : 1000;

    this.paper.style.visibility =
      "visible";

    const backdropAnimation =
      this.backdrop.animate(
        [
          {
            opacity: 0,
          },
          {
            opacity: 1,
          },
        ],
        {
          duration:
            duration * 0.65,
          fill: "forwards",
        }
      );

    const paperAnimation =
      this.paper.animate(
        [
          {
            opacity: 0,
            transform:
              this.reducedMotion
                ? "none"
                : "perspective(1100px) translateY(66px) rotateX(7deg) rotateZ(-1.2deg) scale(.94)",
          },
          {
            opacity: 1,
            transform:
              "perspective(1100px) translateY(0) rotateX(0) rotateZ(0) scale(1)",
          },
        ],
        {
          duration,
          easing:
            "cubic-bezier(.16,1,.3,1)",
          fill: "forwards",
        }
      );

    try {
      await Promise.all([
        paperAnimation.finished,
        backdropAnimation.finished,
      ]);

      if (
        cycle !== this.cycle ||
        this.status !== "opening"
      ) {
        return;
      }

      this.setState("open");

      this.nativeDelay =
        setTimeout(
          () => {
            if (
              cycle ===
                this.cycle &&
              this.status ===
                "open"
            ) {
              this.beginTyping();
            }
          },
          this.reducedMotion
            ? 0
            : CONFIG.letter
                .typingDelay *
              1000
        );
    } catch {
      return;
    }
  }

  getTypingDelay(character, index) {
    const typing =
      CONFIG.letter.typing;

    const pattern = [
      -0.8,
      0.3,
      0.9,
      -0.4,
      0.6,
      -0.7,
      0.2,
      0.5,
      -0.2,
      0.7,
    ];

    const jitter =
      pattern[
        index %
          pattern.length
      ] *
      typing.jitterMs;

    let delay =
      typing.baseMs +
      jitter;

    if (character === ",") {
      delay +=
        typing.commaPauseMs;
    }

    if (
      character === "." ||
      character === "!" ||
      character === "?"
    ) {
      delay +=
        typing.sentencePauseMs;
    }

    if (
      character === "—" ||
      character === "-"
    ) {
      delay +=
        typing.dashPauseMs;
    }

    return Math.max(
      20,
      delay
    );
  }

  getBackspaceDelay(index) {
    const typing =
      CONFIG.letter.typing;

    const pattern = [
      0.25,
      1.1,
      -0.15,
      0.7,
      1.35,
      0.05,
      0.9,
      -0.1,
    ];

    const jitter =
      pattern[
        index %
          pattern.length
      ] *
      typing.backspaceJitterMs;

    return Math.max(
      45,
      typing.backspaceMs +
        jitter
    );
  }

  getCommonPrefixLength(
    first,
    second
  ) {
    const firstCharacters =
      Array.from(first);

    const secondCharacters =
      Array.from(second);

    const length =
      Math.min(
        firstCharacters.length,
        secondCharacters.length
      );

    let index = 0;

    while (
      index < length &&
      firstCharacters[index] ===
        secondCharacters[index]
    ) {
      index += 1;
    }

    return index;
  }

  buildHumanTypingActions(message) {
    const typing =
      CONFIG.letter.typing;

    const actions = [];

    let messageIndex = 0;
    let typingIndex = 0;

    while (
      messageIndex <
      message.length
    ) {
      const typo =
        typing.typos.find(
          item =>
            message.startsWith(
              item.target,
              messageIndex
            )
        );

      if (typo) {
        const wrongCharacters =
          Array.from(
            typo.typed
          );

        const correctCharacters =
          Array.from(
            typo.target
          );

        const commonPrefixLength =
          this.getCommonPrefixLength(
            typo.typed,
            typo.target
          );

        for (
          const character
          of wrongCharacters
        ) {
          actions.push({
            type: "type",
            character,
            delay:
              this.getTypingDelay(
                character,
                typingIndex
              ),
          });

          typingIndex += 1;
        }

        actions.push({
          type: "pause",
          delay:
            typing.correctionPauseMs,
        });

        const deleteCount =
          wrongCharacters.length -
          commonPrefixLength;

        for (
          let index = 0;
          index < deleteCount;
          index += 1
        ) {
          actions.push({
            type: "delete",
            delay:
              this.getBackspaceDelay(
                index
              ),
          });

          if (
            index === 1 &&
            deleteCount > 3
          ) {
            actions.push({
              type: "pause",
              delay: 240,
            });
          }
        }

        actions.push({
          type: "pause",
          delay:
            typing.postCorrectionPauseMs,
        });

        const correction =
          correctCharacters.slice(
            commonPrefixLength
          );

        for (
          const character
          of correction
        ) {
          actions.push({
            type: "type",
            character,
            delay:
              this.getTypingDelay(
                character,
                typingIndex
              ) * 1.12,
          });

          typingIndex += 1;
        }

        actions.push({
          type: "pause",
          delay: 180,
        });

        messageIndex +=
          typo.target.length;

        continue;
      }

      const character =
        message[messageIndex];

      actions.push({
        type: "type",
        character,
        delay:
          this.getTypingDelay(
            character,
            typingIndex
          ),
      });

      typingIndex += 1;
      messageIndex += 1;
    }

    return actions;
  }

  beginTyping() {
    if (
      this.status !== "opening" &&
      this.status !== "open"
    ) {
      return;
    }

    this.skip.disabled = false;

    if (this.reducedMotion) {
      this.finishTyping();
      return;
    }

    this.cursor.style.opacity = "";

    this.paper.classList.add(
      "is-typing"
    );

    const actions =
      this.buildHumanTypingActions(
        CONTENT.message
      );

    const cycle =
      this.cycle;

    let output = "";
    let actionIndex = 0;

    const runNextAction = () => {
      if (
        cycle !== this.cycle ||
        this.status === "closing" ||
        this.status === "closed"
      ) {
        return;
      }

      const action =
        actions[actionIndex];

      if (!action) {
        this.finishTyping();
        return;
      }

      actionIndex += 1;

      if (
        action.type === "type"
      ) {
        output +=
          action.character;

        this.updateTypedText(
          output
        );
      }

      if (
        action.type === "delete"
      ) {
        output =
          Array.from(output)
            .slice(0, -1)
            .join("");

        this.updateTypedText(
          output
        );
      }

      if (this.gsap) {
        this.typingTween =
          this.gsap.delayedCall(
            action.delay / 1000,
            runNextAction
          );

        return;
      }

      this.typingTimer =
        setTimeout(
          runNextAction,
          action.delay
        );
    };

    runNextAction();
  }

  finishTyping() {
    if (
      this.status === "closing" ||
      this.status === "closed"
    ) {
      return;
    }

    this.typingTween?.kill();

    this.typingTween = null;

    clearTimeout(
      this.typingTimer
    );

    this.typingTimer = null;

    clearTimeout(
      this.nativeDelay
    );

    this.nativeDelay = null;

    this.text.textContent =
      CONTENT.message;

    this.positionCursor();

    this.paper.classList.remove(
      "is-typing"
    );

    if (this.gsap) {
      this.gsap.to(
        this.cursor,
        {
          opacity: 0,
          duration: 0.35,
          overwrite: true,
        }
      );
    } else {
      this.cursor.style.opacity =
        "0";
    }

    if (
      document.activeElement ===
      this.skip
    ) {
      this.closeButton.focus({
        preventScroll: true,
      });
    }

    this.skip.hidden = true;
  }

  close() {
    if (
      this.status === "closed" ||
      this.status === "closing"
    ) {
      return;
    }

    const nativeState =
      this.gsap
        ? null
        : {
            paperOpacity:
              getComputedStyle(
                this.paper
              ).opacity,

            paperTransform:
              getComputedStyle(
                this.paper
              ).transform,

            backdropOpacity:
              getComputedStyle(
                this.backdrop
              ).opacity,
          };

    this.cycle += 1;

    this.stopAnimations();

    this.setState("closing");

    this.paper.classList.remove(
      "is-typing"
    );

    this.cursor.style.opacity =
      "0";

    this.skip.disabled = true;

    if (!this.gsap) {
      this.closeNative(
        nativeState
      );

      return;
    }

    const duration =
      this.reducedMotion
        ? 0.14
        : CONFIG.letter.closeDuration;

    this.closeTimeline =
      this.gsap.timeline({
        onComplete: () =>
          this.completeClose(),
      });

    this.onBlur(
      this.closeTimeline
    );

    this.closeTimeline.to(
      this.paper,
      {
        autoAlpha: 0,
        y:
          this.reducedMotion
            ? 0
            : 42,
        scale:
          this.reducedMotion
            ? 1
            : 0.97,
        rotationX:
          this.reducedMotion
            ? 0
            : -3,
        duration,
        ease: "power2.inOut",
      },
      0
    );

    this.closeTimeline.to(
      this.backdrop,
      {
        opacity: 0,
        duration:
          duration * 0.9,
        ease: "sine.inOut",
      },
      duration * 0.15
    );
  }

  async closeNative(current) {
    this.onBlur(null);

    const duration =
      this.reducedMotion
        ? 140
        : 650;

    const paperAnimation =
      this.paper.animate(
        [
          {
            opacity:
              current.paperOpacity,

            transform:
              current.paperTransform,
          },
          {
            opacity: 0,

            transform:
              this.reducedMotion
                ? "none"
                : "translateY(36px) scale(.97)",
          },
        ],
        {
          duration,
          easing:
            "ease-in-out",
          fill: "forwards",
        }
      );

    this.backdrop.animate(
      [
        {
          opacity:
            current.backdropOpacity,
        },
        {
          opacity: 0,
        },
      ],
      {
        duration,
        fill: "forwards",
      }
    );

    try {
      await paperAnimation.finished;
    } catch {
      return;
    }

    if (
      this.status === "closing"
    ) {
      this.completeClose();
    }
  }

  completeClose() {
    this.dialog.close();

    this.stopAnimations();

    this.paper.removeAttribute(
      "style"
    );

    this.backdrop.removeAttribute(
      "style"
    );

    this.resetCursor();

    document.body.classList.remove(
      "reading-letter"
    );

    this.setState("closed");

    this.previousFocus?.focus?.({
      preventScroll: true,
    });
  }

  stopAnimations() {
    this.openTimeline?.kill();
    this.closeTimeline?.kill();
    this.typingTween?.kill();

    this.openTimeline = null;
    this.closeTimeline = null;
    this.typingTween = null;

    clearTimeout(
      this.nativeDelay
    );

    clearTimeout(
      this.typingTimer
    );

    this.nativeDelay = null;
    this.typingTimer = null;

    if (
      this.cursorFrame !== null
    ) {
      cancelAnimationFrame(
        this.cursorFrame
      );

      this.cursorFrame = null;
    }

    this.paper
      .getAnimations()
      .forEach(
        animation =>
          animation.cancel()
      );

    this.backdrop
      .getAnimations()
      .forEach(
        animation =>
          animation.cancel()
      );
  }

  dispose() {
    this.events.abort();

    this.cycle += 1;

    this.stopAnimations();

    this.resizeObserver?.disconnect();

    this.resizeObserver = null;

    if (this.dialog.open) {
      this.dialog.close();
    }

    document.body.classList.remove(
      "reading-letter"
    );

    this.paper.removeAttribute(
      "style"
    );

    this.backdrop.removeAttribute(
      "style"
    );

    this.resetCursor();
  }
}