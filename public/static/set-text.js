/**
 * set-text.js - セット別の質問文・下書き・合成スキップ語の差し替え
 * ================================================
 * ・index.tsx が window.__SET_TEXT__（辞書）を埋め込んだセットだけ、app.js の後に読み込まれる。
 *   辞書のないセット（1〜5・7）ではこのファイルは読み込まれず、app.js の動きは一切変わらない。
 * ・app.js は変更しない。後から読み込まれるこのファイルが、次のものだけを差し替える。
 *     QUESTIONS[2..6]            … 質問文（Q2 は Q1 の回答を「○○ですね！」に入れる）
 *     showTypingThenMessage      … 確認メッセージの見出し
 *     buildPrompt                … 日本語ドラフトの1行目・2行目・5行目・見出し
 *     shouldSkipComposite        … 回答に頭上の飾り・背の高い物・行事・灯りの語があるときの追加スキップ
 * ・Q1 の表示は index.tsx の初期HTML（initialQuestionHtml）で差し替える。
 * ・「季節・時間帯:」の見出しは変えない（app.js の時間帯行判定が行頭のこの文字列を使うため）。
 */
(function () {
  'use strict';

  var T = window.__SET_TEXT__;
  var W = window.__IMAGE_SET__ || {};
  if (!T) return;

  var ANSWER_KEYS = ['facilityType', 'usageScene', 'style', 'surroundings', 'timeOfDay', 'additionalNotes'];

  // ---- 文字列ヘルパー ----
  var plain = function (s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  };
  // 完全一致の判定用: 空白と句読点（。、！!？?）をすべて取る
  var compact = function (s) {
    return plain(s).replace(/[\s。．.、，,！!？?]/g, '');
  };
  // 「特になし」系の回答か（空白・句読点を除いた全体が、辞書の語のどれかと完全に一致するときだけ true）
  var isNoneAnswer = function (s) {
    var c = compact(s);
    if (!c) return true;
    return (T.noneWords || []).indexOf(c) >= 0;
  };

  // ---- Q2: 「○○ですね！」 ----
  var Q2_SKIP_WORDS = ['なし', 'ない', 'なんでも', '特に', 'とくに', '任せ'];
  var Q2_MAX_LENGTH = 20;
  var Q2_END_RE = /(です|ます|たい|ほしい|欲しい|ください|か)$/;
  // Q1 の回答を Q2 に入れてよいときは整えた文字列、入れないときは null
  var q1ForQ2 = function (q1) {
    var a = plain(q1).replace(/[。．.！!、，,\s]+$/, '');
    if (!a) return null;
    if (Array.from(a).length > Q2_MAX_LENGTH) return null;
    if (Q2_SKIP_WORDS.some(function (w) { return a.indexOf(w) >= 0; })) return null;
    if (/[？?]/.test(a)) return null;
    if (Q2_END_RE.test(a)) return null;
    return a;
  };

  var qs = T.questions || {};
  [3, 4, 5, 6].forEach(function (n) {
    if (typeof qs[n] === 'string') QUESTIONS[n] = function () { return qs[n]; };
  });
  if (typeof qs[2] === 'string') {
    QUESTIONS[2] = function () {
      var a = q1ForQ2(answers.facilityType);
      if (a === null) return T.q2Fixed;
      return qs[2].replace('{Q1}', function () { return a; });
    };
  }

  // ---- 確認メッセージの見出し ----
  var SUMMARY_HEAD = 'ありがとうございます！以下の内容で';
  // 各行の先頭（maxOffset 文字以内）にある旧見出しを新見出しに置き換える。1つの旧見出しにつき最初の1行だけ
  var replaceLinePrefixes = function (text, pairs, maxOffset) {
    var lines = text.split('\n');
    pairs.forEach(function (p) {
      for (var i = 0; i < lines.length; i++) {
        var at = lines[i].indexOf(p[0]);
        if (at >= 0 && at <= maxOffset) {
          lines[i] = lines[i].slice(0, at) + p[1] + lines[i].slice(at + p[0].length);
          break;
        }
      }
    });
    return lines.join('\n');
  };
  if (T.summaryLabels && typeof showTypingThenMessage === 'function') {
    var _showTyping = showTypingThenMessage;
    showTypingThenMessage = function (text, onShown) {
      var t = text;
      if (typeof t === 'string' && t.indexOf(SUMMARY_HEAD) === 0) t = replaceLinePrefixes(t, T.summaryLabels, 4);
      return _showTyping(t, onShown);
    };
  }

  // ---- 日本語ドラフト ----
  var fill = function (tpl, area, q1) {
    return tpl.replace('{AREA}', function () { return area; }).replace('{Q1}', function () { return q1; });
  };
  var convertDraft = function (t, a) {
    var area = W.maskAreaLabel || '';
    var fac = a.facilityType;
    var o1 = area + 'を' + fac + 'をメインとした場所にする。\n';
    var o2 = fac + 'の周りは、' + fac + 'にあった雰囲気のものにすること。\n';
    var o5 = 'ただし、' + fac + 'や樹木などの追加要素の上端が、画像の途中で水平に切れないようにする。';
    if (t.indexOf(o1 + o2) !== 0 || t.indexOf(o5) < 0) {
      console.warn('[set-text] ドラフトの形が想定と違うため、変換せずそのまま使います');
      return t;
    }
    var line1 = isNoneAnswer(fac) ? fill(T.draftLine1None, area, '') : fill(T.draftLine1, area, plain(fac));
    // 2行目は削除。5行目の施設名は固定語に置き換える
    t = line1 + '\n' + t.slice((o1 + o2).length);
    t = t.replace(o5, function () { return T.draftLine5; });
    return replaceLinePrefixes(t, T.draftLabels || [], 0);
  };
  var _buildPrompt = buildPrompt;
  buildPrompt = function (a) {
    var t = _buildPrompt(a);
    try {
      return convertDraft(t, a || {});
    } catch (e) {
      console.warn('[set-text] ドラフトの変換に失敗しました:', e);
      return t;
    }
  };

  // ---- 合成の追加スキップ ----
  // 回答（6問すべて）に、頭上の飾り・背の高い物・行事・灯りの語があれば、合成をスキップする。ヒットした語を全部返す
  var findExtraSkipWords = function () {
    var ex = T.extraSkip;
    if (!ex) return [];
    var v = ANSWER_KEYS.map(function (k) { return answers[k]; }).filter(Boolean).join('\n');
    (ex.strip || []).forEach(function (w) { v = v.split(w).join(''); });
    var hits = [];
    ['hang', 'tall', 'event', 'lamp'].forEach(function (g) {
      (ex[g] || []).forEach(function (w) { if (v.indexOf(w) >= 0) hits.push(w); });
    });
    return hits;
  };
  var _shouldSkipComposite = shouldSkipComposite;
  shouldSkipComposite = function (text, ignoreWords, timeOfDayOnlyWords) {
    if (_shouldSkipComposite(text, ignoreWords, timeOfDayOnlyWords)) return true;
    var hits = findExtraSkipWords();
    if (hits.length > 0) {
      console.log('[composite] set-text: skip words = ' + hits.join(','));
      return true;
    }
    return false;
  };

  // 動作確認用（画面には影響しない）
  window.__SET_TEXT_API__ = { findExtraSkipWords: findExtraSkipWords, isNoneAnswer: isNoneAnswer, q1ForQ2: q1ForQ2 };
})();
