/**
 * Language Manager
 * 다국어 지원 모듈 (한국어, 영어, 중국어, 일본어, 독일어, 프랑스어, 스페인어)
 */

import { postMessage } from "./vscode-api.js";

let currentLanguage = "ko";
let languageData = {};

/**
 * 현재 언어 코드 가져오기
 * @returns {string}
 */
export function getCurrentLanguage() {
  return currentLanguage;
}

/**
 * 현재 언어 코드 설정
 * @param {string} lang
 */
export function setCurrentLanguage(lang) {
  currentLanguage = lang;
}

/**
 * 언어 데이터 가져오기
 * @returns {Object}
 */
export function getLanguageData() {
  return languageData;
}

/**
 * 언어 데이터 설정
 * @param {Object} data
 */
export function setLanguageData(data) {
  languageData = data;
}

/**
 * 번역 텍스트 가져오기
 * @param {string} key - 번역 키
 * @param {string} defaultValue - 기본값
 * @returns {string}
 */
export function t(key, defaultValue = "") {
  return languageData[key] || defaultValue;
}

/**
 * 확장에 언어 데이터 요청
 * @param {string} lang - 언어 코드
 */
export function loadLanguage(lang) {
  try {
    postMessage({ command: "getLanguageData", language: lang });
  } catch (e) {
    console.error("Failed to load language:", lang, e);
  }
}

/**
 * 언어 저장 요청
 * @param {string} lang - 언어 코드
 */
export function saveLanguage(lang) {
  postMessage({ command: "setLanguage", language: lang });
}

/**
 * 언어 데이터 수신 메시지 핸들러
 * @param {Object} message - 메시지 객체
 * @param {Function} applyCallback - 언어 적용 콜백
 * @returns {boolean} 처리 여부
 */
export function handleLanguageMessage(message, applyCallback) {
  switch (message.command) {
    case "languageDataLoaded":
    case "languageDataReceived":
      if (message.languageData || message.data) {
        languageData = message.languageData || message.data;
        console.log(
          "[Language Manager] Language data loaded:",
          Object.keys(languageData).length,
          "keys"
        );
        if (applyCallback) {
          applyCallback();
        }
      }
      return true;

    case "languageSaved":
      console.log("[Language Manager] Language saved:", message.language);
      return true;

    case "languageSaveError":
      console.error("[Language Manager] Language save error:", message.error);
      return true;

    case "currentLanguage":
      if (message.language) {
        currentLanguage = message.language;
        loadLanguage(message.language);
      }
      return true;

    default:
      return false;
  }
}

/**
 * 현재 언어 요청
 */
export function requestCurrentLanguage() {
  postMessage({ command: "getCurrentLanguage" });
}
