import { CONTENT } from "./config.js";

/** Use textContent so edited messages are text, never executable HTML. */
export function applyContent() {
  document.title = CONTENT.title;
  const words = document.querySelectorAll(".hero-word");
  words[0].textContent = CONTENT.heading;
  words[1].textContent = CONTENT.headingAccent;
  document.querySelector(".hero-eyebrow").textContent = CONTENT.eyebrow;
  document.querySelector(".hero-subtitle").textContent = CONTENT.subtitle;
  document.querySelector("#garden-hint span").textContent = CONTENT.hint;
}
