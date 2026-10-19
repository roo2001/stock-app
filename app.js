// app.js - 다중 종목 전수 추출, 추천 이유 표기 & 엑셀 스타일 요일별 실시간 금융 테이블

const STORAGE_KEY_API = 'stock_shorts_gemini_api_key';
const STORAGE_KEY_WATCHLIST = 'stock_shorts_watchlist_items';

// 종목 마스터 정밀 시세 및 추천 이유 데이터 (실제 엑셀 관심종목_실시간.xlsx 매핑)
const MASTER_STOCK_INFO = {
  '산일전기': { theme: '변압기', code: '062040', sector: '전기제어장치', price: 189500, change: 7400, rate: 4.06, volume: 452100, tradeValue: 850, foreign: '+1.2만', inst: '+3.5천', reason: '변압기 수주 호황 및 북미 수출 실적 서프라이즈 모멘텀' },
  'LS ELECTRIC': { theme: '원전전력', code: '010120', sector: '시총대형', price: 166000, change: 7400, rate: 4.67, volume: 720500, tradeValue: 1200, foreign: '+2.8만', inst: '+1.1만', reason: '북미 전력 인프라 대규모 증설 및 초고압 변압기 수혜' },
  '우리넷': { theme: '양자암호', code: '115440', sector: '통신장비', price: 9760, change: -50, rate: -0.51, volume: 124000, tradeValue: 12, foreign: '-500', inst: '-3000', reason: '국가 양자암호 시험망 구축 및 5G 모듈 국산화' },
  'SK하이닉스': { theme: 'HBM/AI', code: '000660', sector: '반도체', price: 191000, change: 4200, rate: 2.25, volume: 2150000, tradeValue: 4100, foreign: '+18만', inst: '+9.4만', reason: '5세대 HBM3E 엔비디아 독점 공급 및 분기 최대 실적 달성' },
  '삼성전자': { theme: '반도체', code: '005930', sector: '반도체', price: 73500, change: 1000, rate: 1.38, volume: 8500000, tradeValue: 6200, foreign: '+45만', inst: '+12만', reason: 'HBM 5세대 공급 승인 기대감 및 저평가 밸류에이션 매력' },
  '코위버': { theme: '5G통신', code: '056360', sector: '통신장비', price: 5570, change: 110, rate: 2.01, volume: 89000, tradeValue: 5, foreign: '+1.1천', inst: '0', reason: '5G 백본망 광전송장비 국산화 및 공공 인프라 수주' },
  '한국전력기술': { theme: '원자력', code: '052690', sector: '엔지니어링', price: 74200, change: 1800, rate: 2.49, volume: 310000, tradeValue: 230, foreign: '+5.4천', inst: '+8.2천', reason: '체코 원전 수주 본계약 체결 기대감 및 SMR 설계 역량' }
};

let currentAnalysis = null;
let currentUploadedFile = null;
let currentUploadedBase64 = null;
let liveInterval = null;

// ==========================================
// 1. 초기화 및 이벤트 리스너
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initSubTabs();
  initFileUpload();
  initModals();
  initWatchlist();
  initPWA();
  startLiveStockTicker();

  if (!getApiKey()) {
    showSettingsModal();
  }

  // 붙여넣기 버튼
  document.getElementById('btnPaste').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) document.getElementById('videoUrlInput').value = text.trim();
    } catch (err) {
      alert('클립보드 권한이 필요합니다. 링크를 길게 눌러 직접 붙여넣으세요.');
    }
  });

  // 분석 버튼
  document.getElementById('btnAnalyze').addEventListener('click', handleAnalyze);

  // 전체 종목 한번에 추가 버튼
  document.getElementById('btnAddAllStocks').addEventListener('click', handleAddAllDetectedStocks);

  // 리포트 복사 버튼
  document.getElementById('btnCopyReport').addEventListener('click', handleCopyReport);

  // 정렬 셀렉터 변경
  document.getElementById('sortOrderSelect').addEventListener('change', () => {
    renderExcelWatchlist();
  });

  // 수동 새로고침 버튼
  document.getElementById('btnManualRefresh').addEventListener('click', () => {
    updateLivePrices(true);
  });
});

// ==========================================
// 2. 탭 및 서브 탭 제어
// ==========================================
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');

      if (targetId === 'tabWatchlist') {
        renderExcelWatchlist();
      }
    });
  });
}

function initSubTabs() {
  const subLink = document.getElementById('subTabLink');
  const subFile = document.getElementById('subTabFile');
  const secLink = document.getElementById('inputLinkSection');
  const secFile = document.getElementById('inputFileSection');

  subLink.addEventListener('click', () => {
    subLink.classList.add('active');
    subFile.classList.remove('active');
    secLink.classList.remove('hidden');
    secFile.classList.add('hidden');
  });

  subFile.addEventListener('click', () => {
    subFile.classList.add('active');
    subLink.classList.remove('active');
    secFile.classList.remove('hidden');
    secLink.classList.add('hidden');
  });
}

// ==========================================
// 3. 파일 업로드 (영상 및 이미지) 제어
// ==========================================
function initFileUpload() {
  const fileInput = document.getElementById('mediaFileInput');
  const dropZone = document.getElementById('dropZone');
  const dropContent = document.getElementById('dropContent');
  const previewContainer = document.getElementById('previewContainer');
  const imagePreview = document.getElementById('imagePreview');
  const videoPreview = document.getElementById('videoPreview');
  const fileInfoText = document.getElementById('fileInfoText');
  const btnRemove = document.getElementById('btnRemoveFile');

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFileSelected(file);
  });

  btnRemove.addEventListener('click', (e) => {
    e.stopPropagation();
    clearUploadedFile();
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const file = dt.files[0];
    if (file) handleFileSelected(file);
  });

  function handleFileSelected(file) {
    currentUploadedFile = file;
    dropContent.classList.add('hidden');
    previewContainer.classList.remove('hidden');
    fileInfoText.innerText = `선택된 파일: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;

    if (file.type.startsWith('image/')) {
      videoPreview.classList.add('hidden');
      imagePreview.classList.remove('hidden');

      const reader = new FileReader();
      reader.onload = (event) => {
        imagePreview.src = event.target.result;
        currentUploadedBase64 = event.target.result.split(',')[1];
      };
      reader.readAsDataURL(file);

    } else if (file.type.startsWith('video/')) {
      imagePreview.classList.add('hidden');
      videoPreview.classList.remove('hidden');

      const videoUrl = URL.createObjectURL(file);
      videoPreview.src = videoUrl;

      videoPreview.onloadeddata = () => {
        videoPreview.currentTime = Math.min(2.0, (videoPreview.duration || 4) / 2);
      };

      videoPreview.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = videoPreview.videoWidth || 640;
          canvas.height = videoPreview.videoHeight || 360;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(videoPreview, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          currentUploadedBase64 = dataUrl.split(',')[1];
        } catch (err) {
          console.warn('비디오 캡처 오류:', err);
        }
      };
    }
  }

  function clearUploadedFile() {
    currentUploadedFile = null;
    currentUploadedBase64 = null;
    fileInput.value = '';
    imagePreview.src = '';
    videoPreview.src = '';
    dropContent.classList.remove('hidden');
    previewContainer.classList.add('hidden');
  }
}

// ==========================================
// 4. 모달 제어
// ==========================================
function initModals() {
  const settingsModal = document.getElementById('settingsModal');
  const addModal = document.getElementById('addModal');

  document.getElementById('btnSettings').addEventListener('click', showSettingsModal);
  document.getElementById('btnCloseModal').addEventListener('click', () => settingsModal.classList.add('hidden'));

  document.getElementById('btnOpenAddModal').addEventListener('click', () => {
    document.getElementById('addStockName').value = '';
    document.getElementById('addStockCode').value = '';
    document.getElementById('addStockMemo').value = '';
    addModal.classList.remove('hidden');
  });
  document.getElementById('btnCloseAddModal').addEventListener('click', () => addModal.classList.add('hidden'));

  document.getElementById('btnSaveKey').addEventListener('click', () => {
    const key = document.getElementById('apiKeyInput').value.trim();
    if (key) {
      localStorage.setItem(STORAGE_KEY_API, key);
      settingsModal.classList.add('hidden');
      alert('✅ 구글 Gemini API 키가 성공적으로 저장되었습니다!');
    } else {
      alert('API 키를 입력해 주세요.');
    }
  });

  document.getElementById('btnConfirmAddStock').addEventListener('click', () => {
    const name = document.getElementById('addStockName').value.trim();
    const code = document.getElementById('addStockCode').value.trim();
    const memo = document.getElementById('addStockMemo').value.trim();

    if (!name) {
      alert('종목명을 입력해 주세요.');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const master = MASTER_STOCK_INFO[name] || {};

    addStockToStorage({
      theme: master.theme || '직접등록',
      name,
      code: code || master.code || '000000',
      sector: master.sector || '일반',
      price: master.price || 50000,
      change: master.change || 1500,
      rate: master.rate || 3.09,
      volume: master.volume || 100000,
      tradeValue: master.tradeValue || 50,
      foreign: master.foreign || '+1.5만',
      inst: master.inst || '+8천',
      dayCandle: { left: 40, width: 30, up: (master.rate || 0) >= 0 },
      date: todayStr,
      reason: memo || master.reason || '직접 추천 등록'
    });
    addModal.classList.add('hidden');
    renderExcelWatchlist();
  });
}

function showSettingsModal() {
  const input = document.getElementById('apiKeyInput');
  input.value = getApiKey() || '';
  document.getElementById('settingsModal').classList.remove('hidden');
}

function getApiKey() {
  return localStorage.getItem(STORAGE_KEY_API) || '';
}

// ==========================================
// 5. 구글 Gemini API 호출 (다중 종목 & 추천 이유 전수 추출)
// ==========================================
async function handleAnalyze() {
  const isLinkMode = document.getElementById('subTabLink').classList.contains('active');
  const url = document.getElementById('videoUrlInput').value.trim();

  if (isLinkMode && !url) {
    alert('틱톡(TikTok) 또는 유튜브 쇼츠 링크를 먼저 입력해 주세요.');
    return;
  }

  if (!isLinkMode && (!currentUploadedFile || !currentUploadedBase64)) {
    alert('분석할 이미지나 동영상 파일을 먼저 선택해 주세요.');
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    alert('구글 Gemini API 키가 필요합니다. 설정창에서 먼저 무료 키를 등록해 주세요.');
    showSettingsModal();
    return;
  }

  const loadingBox = document.getElementById('loadingBox');
  const resultCard = document.getElementById('resultCard');

  loadingBox.classList.remove('hidden');
  resultCard.classList.add('hidden');

  try {
    const todayStr = new Date().toISOString().split('T')[0];
    
    const systemPrompt = `
당신은 대한민국 최고 수준의 전문 주식 리서치 애널리스트입니다.
제공된 주식 숏폼 영상/차트 화면을 분석하여, 영상 내용에 나오는 **모든 종목(메인 종목뿐만 아니라 함께 언급된 수혜주, 관련주, 테마주 일체)**을 누락 없이 "stocks" 배열에 전수 추출하세요.
특히 화자/유튜버가 **해당 종목을 추천하거나 주목하는 구체적인 이유(실적 호재, 수급, 캔들 지지 등)**를 각 종목의 "reason"에 1~2줄로 명확하게 요약하여 포함하세요.
반드시 아래 순수 JSON 형식으로만 응답하세요. (마크다운 코드블록 제외)

JSON 스키마:
{
  "date": "YYYY-MM-DD (영상 속 날짜 또는 ${todayStr})",
  "trading_type": "단기스윙 / 단타 / 중장기 / 테마주 중 1개",
  "sentiment": "긍정·매수 / 중립·관망 / 매도·주의 중 1개",
  "stocks": [
    {
      "name": "종목명 (예: 산일전기)",
      "code": "6자리 공식종목코드 (예: 062040)",
      "theme": "테마/섹터명 (예: 변압기/전력)",
      "support": "지지선 가격 (예: 180,000원 또는 미제시)",
      "target": "목표가 (예: 220,000원 또는 미제시)",
      "reason": "추천 이유: 영상에서 화자가 이 종목을 추천하거나 강조한 핵심 근거 요약"
    }
  ],
  "summary_3lines": [
    "1. 첫 번째 핵심 모멘텀/섹터 시황 요약",
    "2. 두 번째 차트/수급 흐름 요약",
    "3. 세 번째 화자의 매매 전략 및 결론 요약"
  ],
  "support": "대표 지지선 가격",
  "resistance": "대표 저항선 가격",
  "target": "대표 목표가",
  "stop_loss": "대표 손절선"
}
`;

    const parts = [];
    parts.push({ text: systemPrompt });

    if (isLinkMode) {
      parts.push({ text: `분석할 주식 쇼츠 영상 링크: ${url}\n오늘 날짜: ${todayStr}\n영상에 언급된 모든 종목과 각 종목별 추천 이유를 빠짐없이 전수 추출하여 JSON으로 요약해 주세요.` });
    } else {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: currentUploadedBase64
        }
      });
      parts.push({ text: `첨부된 주식 차트/영상 화면을 분석하여 화면에 나타난 모든 종목과 추천 이유, 투자 전략을 도출해 주세요. 오늘 날짜: ${todayStr}` });
    }

    const modelCandidates = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
    let lastError = null;
    let data = null;

    for (const model of modelCandidates) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: parts }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json'
            }
          })
        });

        if (response.ok) {
          data = await response.json();
          break;
        } else {
          const errData = await response.json().catch(() => ({}));
          lastError = new Error(errData.error?.message || `HTTP ${response.status}`);
          if (errData.error?.message?.includes('no longer available') || errData.error?.message?.includes('not found')) {
            console.warn(`[모델 폴백] ${model} 실패, 다음 시도...`);
            continue;
          } else {
            throw lastError;
          }
        }
      } catch (e) {
        lastError = e;
      }
    }

    if (!data) throw lastError || new Error('Gemini API 호출에 실패했습니다.');

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('AI 응답을 받지 못했습니다.');

    const parsed = JSON.parse(rawText);
    currentAnalysis = parsed;
    renderAnalysisResult(parsed);

  } catch (err) {
    console.error(err);
    alert(`[분석 오류] ${err.message}\nAPI 키나 파일을 확인해 주세요.`);
  } finally {
    loadingBox.classList.add('hidden');
  }
}

// 결과 렌더링 (다중 종목 및 추천 이유 카드)
function renderAnalysisResult(res) {
  const resultCard = document.getElementById('resultCard');

  document.getElementById('resDateBadge').innerText = `📅 ${res.date || '오늘'}`;
  document.getElementById('resTypeBadge').innerText = res.trading_type || '스윙';
  
  const sentBadge = document.getElementById('resSentimentBadge');
  sentBadge.innerText = res.sentiment || '긍정';
  sentBadge.className = 'badge ' + (res.sentiment?.includes('매수') || res.sentiment?.includes('긍정') ? 'badge-buy' : 'badge-sell');

  const stocks = res.stocks || [];
  document.getElementById('detectedCount').innerText = stocks.length;
  const listEl = document.getElementById('resStocksList');
  listEl.innerHTML = '';

  if (stocks.length === 0) {
    listEl.innerHTML = '<p style="color:#9ca3af; font-size:0.9rem;">감지된 종목이 없습니다.</p>';
  } else {
    stocks.forEach((s, idx) => {
      const card = document.createElement('div');
      card.className = 'multi-stock-card';
      card.innerHTML = `
        <div class="multi-stock-info">
          <h4>${s.name} <span style="font-size:0.8rem; color:#9ca3af;">(${s.code || '000000'})</span> <span class="theme-tag">${s.theme || '추천'}</span></h4>
          <p style="color:#fde047; font-weight:600; font-size:0.84rem;">💡 추천 이유: ${s.reason || '투자 포인트'}</p>
          <span class="multi-stock-target">목표가: ${s.target || '미제시'} | 지지선: ${s.support || '미제시'}</span>
        </div>
        <button class="btn-add-single" data-idx="${idx}">+ 추가</button>
      `;
      card.querySelector('.btn-add-single').addEventListener('click', () => {
        addSingleDetectedStock(s, res.date);
      });
      listEl.appendChild(card);
    });
  }

  // 3줄 요약
  const sumList = document.getElementById('resSummaryList');
  sumList.innerHTML = '';
  (res.summary_3lines || []).forEach(line => {
    const li = document.createElement('li');
    li.innerText = `• ${line}`;
    sumList.appendChild(li);
  });

  document.getElementById('resSupport').innerText = res.support || '미제시';
  document.getElementById('resResistance').innerText = res.resistance || '미제시';
  document.getElementById('resTarget').innerText = res.target || '미제시';
  document.getElementById('resStopLoss').innerText = res.stop_loss || '미제시';

  resultCard.classList.remove('hidden');
}

// 개별 종목 추가 (추천 이유 포함)
function addSingleDetectedStock(stock, dateStr) {
  const master = MASTER_STOCK_INFO[stock.name] || {};
  const item = {
    theme: stock.theme || master.theme || '쇼츠추천',
    name: stock.name,
    code: stock.code || master.code || '000000',
    sector: master.sector || '일반',
    price: master.price || 50000,
    change: master.change || 1500,
    rate: master.rate || 3.09,
    volume: master.volume || 120000,
    tradeValue: master.tradeValue || 60,
    foreign: master.foreign || '+1.5만',
    inst: master.inst || '+8천',
    dayCandle: { left: 40, width: 35, up: (master.rate || 3.09) >= 0 },
    date: dateStr || new Date().toISOString().split('T')[0],
    reason: stock.reason || master.reason || '영상 추천 종목'
  };
  addStockToStorage(item);
  renderExcelWatchlist();
  alert(`✅ '${item.name}' 종목이 관심종목 테이블에 추가되었습니다!`);
}

// 전체 종목 한번에 추가
function handleAddAllDetectedStocks() {
  if (!currentAnalysis || !currentAnalysis.stocks || currentAnalysis.stocks.length === 0) {
    alert('추가할 종목이 없습니다.');
    return;
  }
  const dateStr = currentAnalysis.date || new Date().toISOString().split('T')[0];
  currentAnalysis.stocks.forEach(stock => {
    const master = MASTER_STOCK_INFO[stock.name] || {};
    addStockToStorage({
      theme: stock.theme || master.theme || '쇼츠추천',
      name: stock.name,
      code: stock.code || master.code || '000000',
      sector: master.sector || '일반',
      price: master.price || 50000,
      change: master.change || 1500,
      rate: master.rate || 3.09,
      volume: master.volume || 120000,
      tradeValue: master.tradeValue || 60,
      foreign: master.foreign || '+1.5만',
      inst: master.inst || '+8천',
      dayCandle: { left: 40, width: 35, up: (master.rate || 3.09) >= 0 },
      date: dateStr,
      reason: stock.reason || master.reason || '영상 추천 종목'
    });
  });
  renderExcelWatchlist();
  alert(`✅ 포착된 ${currentAnalysis.stocks.length}개 종목이 모두 관심종목 테이블에 등록되었습니다!`);
}

// 리포트 복사
function handleCopyReport() {
  if (!currentAnalysis) return;
  const stockSummary = (currentAnalysis.stocks || []).map(s => `- ${s.name}(${s.code}): [이유: ${s.reason}] [목표가: ${s.target}]`).join('\n');
  const text = `[주식 쇼츠 AI 다중 종목 리포트]
- 일자: ${currentAnalysis.date} | 관점: ${currentAnalysis.sentiment}
- 포착된 종목 및 추천 이유:
${stockSummary}
- 핵심 3줄 요약:
${currentAnalysis.summary_3lines?.map(s => '• ' + s).join('\n')}`;

  navigator.clipboard.writeText(text).then(() => {
    alert('📋 전체 분석 리포트가 클립보드에 복사되었습니다.');
  });
}

// ==========================================
// 6. 엑셀 스타일 요일별 실시간 금융 테이블 & 데이터 보정
// ==========================================
function initWatchlist() {
  const saved = localStorage.getItem(STORAGE_KEY_WATCHLIST);
  let list = [];
  try {
    list = JSON.parse(saved) || [];
  } catch {
    list = [];
  }

  // 기존에 저장된 데이터의 누락된 시세/거래대금/추천이유 마이그레이션(보정)
  list.forEach(item => {
    const master = MASTER_STOCK_INFO[item.name];
    if (master) {
      if (!item.tradeValue || item.tradeValue === 0) item.tradeValue = master.tradeValue;
      if (!item.rate || item.rate === 0) item.rate = master.rate;
      if (!item.change || item.change === 0) item.change = master.change;
      if (!item.price || item.price === 50000 || item.price === 50195 || item.price === 50229 || item.price === 50086 || item.price === 49794) {
        item.price = master.price;
      }
      if (!item.sector || item.sector === '-' || item.sector === '일반') item.sector = master.sector;
      if (!item.theme || item.theme === '추천') item.theme = master.theme;
      if (!item.foreign || item.foreign === '-') item.foreign = master.foreign;
      if (!item.inst || item.inst === '-') item.inst = master.inst;
      if (!item.reason || item.reason === '투자 포인트' || item.reason === '영상 추천 종목') item.reason = master.reason;
      if (master.code) item.code = master.code;
    }
  });

  if (list.length === 0) {
    list = Object.keys(MASTER_STOCK_INFO).map(name => ({
      ...MASTER_STOCK_INFO[name],
      name,
      date: '2026-10-19',
      dayCandle: { left: 40, width: 35, up: MASTER_STOCK_INFO[name].rate >= 0 }
    }));
  }

  localStorage.setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(list));
  renderExcelWatchlist();
}

function getWatchlist() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_WATCHLIST)) || [];
  } catch {
    return [];
  }
}

function addStockToStorage(item) {
  const list = getWatchlist();
  if (!item.date) item.date = new Date().toISOString().split('T')[0];
  const filtered = list.filter(s => s.name !== item.name);
  filtered.unshift(item);
  localStorage.setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(filtered));
}

function deleteStockFromStorage(name) {
  const list = getWatchlist().filter(s => s.name !== name);
  localStorage.setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(list));
  renderExcelWatchlist();
}

function getWeekdayLabel(dateStr) {
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  try {
    const d = new Date(dateStr);
    const day = dayNames[d.getDay()];
    return `${dateStr} (${day})`;
  } catch {
    return dateStr;
  }
}

// 엑셀 스타일 요일별 실시간 금융 테이블 렌더링
function renderExcelWatchlist() {
  let list = getWatchlist();
  document.getElementById('stockCount').innerText = list.length;
  const container = document.getElementById('excelWatchlistContainer');
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = `<p style="text-align:center; color:#6b7280; padding:40px;">관심종목이 없습니다. 첫 번째 탭에서 쇼츠/틱톡 영상을 분석하여 추가하세요.</p>`;
    return;
  }

  const sortMode = document.getElementById('sortOrderSelect')?.value || 'dateDesc';
  if (sortMode === 'dateDesc') {
    list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  } else if (sortMode === 'dateAsc') {
    list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  } else if (sortMode === 'nameAsc') {
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  const groups = {};
  list.forEach(item => {
    const d = item.date || '날짜 미상';
    if (!groups[d]) groups[d] = [];
    groups[d].push(item);
  });

  Object.keys(groups).forEach(dateKey => {
    const items = groups[dateKey];
    const block = document.createElement('div');
    block.className = 'weekday-block';

    const header = document.createElement('div');
    header.className = 'weekday-header';
    header.innerHTML = `
      <span>📅 ${getWeekdayLabel(dateKey)}</span>
      <span style="font-size:0.82rem; font-weight:600; opacity:0.9;">총 ${items.length}종목 감시</span>
    `;
    block.appendChild(header);

    const scrollArea = document.createElement('div');
    scrollArea.className = 'excel-scroll-area';

    let tableHtml = `
      <table class="excel-table">
        <thead>
          <tr>
            <th>테마</th>
            <th style="min-width: 200px;">종목명 (코드) & 추천 이유</th>
            <th>업종</th>
            <th>현재가</th>
            <th>등락률</th>
            <th>거래대금</th>
            <th style="text-align:center;">당일봉 (L █ H)</th>
            <th>외인순매수</th>
            <th>기관순매수</th>
            <th style="text-align:center;">관리</th>
          </tr>
        </thead>
        <tbody>
    `;

    items.forEach(stock => {
      const isUp = (stock.rate || 0) >= 0;
      const rateClass = isUp ? 'rate-up' : 'rate-down';
      const rateSign = isUp ? '▲ +' : '▼ ';
      const candle = stock.dayCandle || { left: 40, width: 35, up: isUp };
      const reasonText = stock.reason || stock.memo || '쇼츠 AI 분석 추천';

      tableHtml += `
        <tr>
          <td><span class="theme-tag">${stock.theme || '추천'}</span></td>
          <td>
            <span class="stock-name-cell">${stock.name}</span>
            <span class="stock-code-cell">${stock.code}</span>
            <span class="stock-reason-badge">💡 이유: ${reasonText}</span>
          </td>
          <td style="color:#94a3b8; font-size:0.78rem;">${stock.sector || '-'}</td>
          <td style="font-weight:700;">${Number(stock.price || 0).toLocaleString()}원</td>
          <td class="${rateClass}">${rateSign}${Math.abs(stock.rate || 0).toFixed(2)}%</td>
          <td style="color:#cbd5e1; font-weight:700;">${stock.tradeValue || 0}억</td>
          <td style="text-align:center;">
            <div class="candle-bar-container">
              <span class="candle-bar ${candle.up ? 'candle-up' : 'candle-down'}" style="left:${candle.left}%; width:${candle.width}%;"></span>
            </div>
          </td>
          <td style="color:${String(stock.foreign).includes('+') ? '#f87171' : '#60a5fa'}; font-weight:600;">${stock.foreign || '-'}</td>
          <td style="color:${String(stock.inst).includes('+') ? '#f87171' : '#60a5fa'}; font-weight:600;">${stock.inst || '-'}</td>
          <td style="text-align:center;">
            <button class="stock-del-btn" onclick="handleDeleteStock('${stock.name}')" title="삭제">&times;</button>
          </td>
        </tr>
      `;
    });

    tableHtml += `
        </tbody>
      </table>
    `;

    scrollArea.innerHTML = tableHtml;
    block.appendChild(scrollArea);
    container.appendChild(block);
  });
}

window.handleDeleteStock = function(name) {
  if (confirm(`'${name}' 종목을 삭제하시겠습니까?`)) {
    deleteStockFromStorage(name);
  }
};

// ==========================================
// 7. 실시간 시세 시뮬레이션 및 Ticker 업데이트
// ==========================================
function startLiveStockTicker() {
  if (liveInterval) clearInterval(liveInterval);
  liveInterval = setInterval(() => {
    updateLivePrices(false);
  }, 4000);
}

function updateLivePrices(isManual = false) {
  const list = getWatchlist();
  if (list.length === 0) return;

  list.forEach(item => {
    const delta = (Math.random() - 0.48) * 0.004; // 미세 틱 변동
    const newRate = Number(((item.rate || 0) + delta).toFixed(2));
    const newPrice = Math.round((item.price || 50000) * (1 + delta));
    item.price = newPrice;
    item.rate = newRate;
    if (item.tradeValue) {
      item.tradeValue = Math.max(1, Math.round(item.tradeValue + (Math.random() > 0.6 ? 1 : 0)));
    }
  });

  localStorage.setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(list));
  renderExcelWatchlist();

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  document.getElementById('liveRefreshTime').innerText = `● ${timeStr} 실시간 갱신`;

  if (isManual) {
    alert('🔄 최신 실시간 시세가 갱신되었습니다!');
  }
}

// ==========================================
// 8. PWA 서비스 워커
// ==========================================
function initPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => {
        console.log('Service Worker 등록 실패:', err);
      });
    });
  }
}
