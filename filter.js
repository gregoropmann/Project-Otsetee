import { doc, setDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

let BANNED_WORDS = [];

/**
 * Loads banned words array from external words.json file
 */
export async function loadBannedWords() {
  try {
    const response = await fetch('./words.json');
    BANNED_WORDS = await response.json();
    console.log("Banned words loaded successfully.");
  } catch (err) {
    console.error("Failed to load words.json:", err);
  }
}

/**
 * Analyzes input text against BANNED_WORDS, censors matches with asterisks,
 * and returns metadata about matches found.
 * * @param {string} text - Raw input string to analyze
 * @returns {object} { cleanedText, isFlagged, matchedWords }
 */
export function analyzeAndSanitize(text) {
  if (!text || BANNED_WORDS.length === 0) {
    return { cleanedText: text || "", isFlagged: false, matchedWords: [] };
  }

  let cleanedText = text;
  let matchedWords = [];

  BANNED_WORDS.forEach((word) => {
    // Escape special regex characters in the dictionary word
    const safeWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${safeWord}\\b|${safeWord}`, "gi");

    // Check match directly using match() to avoid regex state issues with .test()
    if (regex.test(cleanedText)) {
      matchedWords.push(word);
      // Perform censoring
      cleanedText = cleanedText.replace(regex, (match) => "*".repeat(match.length));
    }
  });

  const isFlagged = matchedWords.length > 0;

  return { cleanedText, isFlagged, matchedWords };
}

/**
 * Silently records a flagged profanity attempt to the 'flagged_logs' Firestore collection.
 * * @param {object} db - Firebase Firestore instance
 * @param {object} user - Current Firebase auth user or null
 * @param {string} originalText - Uncensored text entered by the user
 * @param {Array} matchedWords - Words detected by filter
 * @param {string} location - Form field or context identifier
 */
export async function autoReportProfanity(db, user, originalText, matchedWords, location = "general") {
  if (!db) return;

  try {
    const reportId = `auto_flag_${user ? user.uid : "anon"}_${Date.now()}`;
    
    await setDoc(doc(db, "flagged_logs", reportId), {
      userId: user ? user.uid : "anonymous",
      userName: user ? user.displayName : "Tundmatu",
      userEmail: user ? user.email : "Puudub",
      originalText: originalText,
      matchedWords: matchedWords,
      fieldLocation: location,
      timestamp: new Date().toISOString()
    });

    console.warn("Automaatne rikkumise teavitus salvestatud.");
  } catch (err) {
    console.error("Viga rikkumise registreerimisel:", err);
  }
}
