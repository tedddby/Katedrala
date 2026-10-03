"use strict";

const MAX_TITLE_LENGTH = 140;

function validateTitle(title) {
  if (typeof title !== "string" || title.trim() === "") return "A title is required";
  if (title.trim().length > MAX_TITLE_LENGTH) return `Titles are limited to ${MAX_TITLE_LENGTH} characters`;
  return null;
}

module.exports = { validateTitle, MAX_TITLE_LENGTH };
