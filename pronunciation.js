const readings = {
  烃: 'tīng', 烷: 'wán', 烯: 'xī', 炔: 'quē', 苯: 'běn', 羟: 'qiǎng',
  醇: 'chún', 醚: 'mí', 醛: 'quán', 酮: 'tóng', 羧: 'suō', 酯: 'zhǐ',
  酰: 'xiān', 胺: 'àn', 腈: 'jīng', 卤: 'lǔ', 氯: 'lǜ', 溴: 'xiù',
  碘: 'diǎn', 硝: 'xiāo', 氨: 'ān', 戊: 'wù', 己: 'jǐ', 庚: 'gēng',
  辛: 'xīn', 壬: 'rén', 癸: 'guǐ',
};

export function pronunciationTokens(text) {
  return Array.from(text, character => ({ text: character, pinyin: readings[character] || null }));
}

export function characterReadings(text) {
  return [...new Set(Array.from(text))].filter(character => readings[character])
    .map(character => ({ character, pinyin: readings[character] }));
}

export function speakableName(name) {
  const numbers = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return name.replace(/\d+/g, number => numbers[Number(number)] || number)
    .replace(/[()]/g, '').replace(/-/g, ' ').replace(/,\s*/g, ', ').replace(/\s+/g, ' ').trim();
}

export function chooseEnglishVoice(voices) {
  const english = voices.filter(voice => /^en(?:[-_]|$)/i.test(voice.lang));
  return english.find(voice => voice.localService && /^en[-_]US$/i.test(voice.lang))
    || english.find(voice => voice.localService)
    || english.find(voice => /^en[-_]US$/i.test(voice.lang))
    || english[0] || null;
}

const messages = {
  idle: { zh: '点击朗读英文名称。', en: 'Tap to hear the English name.' },
  requested: { zh: '正在请求设备语音…', en: 'Requesting the device voice…' },
  speaking: { zh: '正在朗读英文名称。', en: 'Reading the English name.' },
  unsupported: { zh: '此浏览器未提供朗读功能，可尝试用Safari打开；拼音仍可阅读。', en: 'Speech is unavailable here. Try Safari; written pinyin remains available.' },
  'voices-loading': { zh: '设备语音尚未就绪或不可用，请稍后再点一次；也可用Safari打开。', en: 'Device voices are not ready or unavailable. Tap again shortly, or open in Safari.' },
  'no-english-voice': { zh: '设备没有可用英语语音，请检查系统语音设置或改用Safari。', en: 'No English voice is available. Check system speech settings or try Safari.' },
  blocked: { zh: '浏览器阻止了朗读，请再次点击，或用Safari打开。', en: 'Speech was blocked. Tap again, or open this page in Safari.' },
  timeout: { zh: '设备语音未能开始，请再次点击并检查音量，或用Safari打开。', en: 'The device voice did not start. Tap again, check volume, or try Safari.' },
  failed: { zh: '本次朗读未完成，请检查设备语音和音量后重试。', en: 'Speech could not complete. Check the device voice and volume, then retry.' },
};

export function createPronunciation({ synth, Utterance, onStatus, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const supported = Boolean(synth && typeof synth.getVoices === 'function'
    && typeof synth.speak === 'function' && typeof synth.cancel === 'function' && typeof Utterance === 'function');
  let sequence = 0;
  let current = null;
  let timer = null;
  let voices = [];
  let disposed = false;
  function report(state, code = state) {
    if (!disposed) onStatus({ state, code, message: messages[code], supported });
  }
  function clearPending() {
    if (timer !== null) { clearTimer(timer); timer = null; }
  }
  function refresh() {
    if (supported) voices = synth.getVoices();
  }
  function stop() {
    sequence++;
    clearPending();
    if (supported && current) synth.cancel();
    current = null;
    report(supported ? 'idle' : 'error', supported ? 'idle' : 'unsupported');
  }
  refresh();
  if (supported) synth.addEventListener?.('voiceschanged', refresh);
  report(supported ? 'idle' : 'error', supported ? 'idle' : 'unsupported');

  return {
    speak(name, slow = false) {
      if (disposed) return;
      if (!supported) { report('error', 'unsupported'); return; }
      sequence++;
      const request = sequence;
      clearPending();
      synth.cancel();
      current = null;
      refresh();
      const voice = chooseEnglishVoice(voices);
      if (!voice) { report('error', voices.length ? 'no-english-voice' : 'voices-loading'); return; }
      const utterance = new Utterance(speakableName(name));
      current = utterance;
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = slow ? .65 : .9;
      utterance.onstart = () => {
        if (request !== sequence || disposed) return;
        clearPending();
        report('speaking');
      };
      utterance.onend = () => {
        if (request !== sequence || disposed) return;
        clearPending();
        current = null;
        report('idle');
      };
      utterance.onerror = event => {
        if (request !== sequence || disposed) return;
        clearPending();
        current = null;
        if (['canceled', 'interrupted'].includes(event.error)) report('idle');
        else report('error', event.error === 'not-allowed' ? 'blocked' : 'failed');
      };
      report('requested');
      timer = setTimer(() => {
        if (request !== sequence || disposed) return;
        sequence++;
        clearPending();
        synth.cancel();
        current = null;
        report('error', 'timeout');
      }, 5000);
      try { synth.speak(utterance); }
      catch {
        clearPending();
        current = null;
        report('error', 'failed');
      }
    },
    stop,
    dispose() {
      stop();
      disposed = true;
      if (supported) synth.removeEventListener?.('voiceschanged', refresh);
    },
  };
}
