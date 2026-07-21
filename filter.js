import { doc, setDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

let BANNED_WORDS = [];
export async function loadBannedWords() {
  try {
    const response = await fetch('./words.json');
    BANNED_WORDS = await response.json();
    console.log("Banned words loaded successfully.");
  } catch (err) {
    console.error("Failed to load words.json:", err);
  }
}

export function analyzeAndSanitize(text) {
  if (!text || BANNED_WORDS.length === 0) {
    return { cleanedText: text || "", isFlagged: false, matchedWords: [] };
  }

  let cleanedText = text;
  let isFlagged = false;
  let matchedWords = [];

  BANNED_WORDS.forEach((word) => {
    const safeWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${safeWord}\\b|${safeWord}`, "gi");

    if (regex.test(cleanedText)) {
      isFlagged = true;
      matchedWords.push(word);
      cleanedText = cleanedText.replace(regex, (match) => "*".repeat(match.length));
    }
  });

  return { cleanedText, isFlagged, matchedWords };
}

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
