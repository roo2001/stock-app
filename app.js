// app.js - 다중 종목 전수 추출 & 엑셀 스타일 요일별 실시간 금융 테이블 지원

const STORAGE_KEY_API = 'stock_shorts_gemini_api_key';
const STORAGE_KEY_WATCHLIST = 'stock_shorts_watchlist_items';

// 엑셀 스타일 기본 관심종목 데이터 (실제 KIS 엑셀 양식 항목 반영)
const DEFAULT_WATCHLIST = [
  { theme: '변압기', name: '산일전기', code: '062040', sector: '전기제어장치', price: 189500, change: 7400, rate: 4.06, volume: 452100, tradeValue: 850, foreign: '+1.2만', inst: '+3.5천', dayCandle: { left: 40, width: 35, up: true }, date: '2026-10-19' },
  { theme: '원전전력', name: 'LS ELECTRIC', code: '010120', sector: '시총대형', price: 166000, change: 7400, rate: 4.67, volume: 720500, tradeValue: 1200, foreign: '+2.8만', inst: '+1.1만', dayCandle: { left: 50, width: 40, up: true }, date: '2026-10-19' },
  { theme: '양자암호', name: '우리넷', code: '115440', sector: '통신장비', price: 9760, change: -50, rate: -0.51, volume: 124000, tradeValue: 12, foreign: '-500', inst: '-3000', dayCandle: { left: 10, width: 25, up: false }, date: '2026-10-19' },
  { theme: '원자력', name: '한국전력기술', code: '052690', sector: '엔지니어링', price: 74200, change: 1800, rate: 2.49, volume: 310000, tradeValue: 230, foreign: '+5.4천', inst: '+8.2천', dayCandle: { left: 30, width: 45, up: true }, date: '2026-10-19' },
  { theme: '5G통신', name: '코위버', code: '056360', sector: '통신장비', price: 5570, change: 110, rate: 2.01, volume: 89000, tradeValue: 5, foreign: '+1.1천', inst: '0', dayCandle: { left: 20, width: 30, up: true }, date: '2026-10-19' },
  { theme: 'AI반도체', name: 'SK하이닉스', code: '000660', sector: '반도체', price: 191000, change: 4200, rate: 2.25, volume: 2150000, tradeValue: 4100, foreign: '+18만', inst: '+9.4만', dayCandle: { left: 45, width: 35, up: true }, date: '2026-10-18' }
];

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
    addStockToStorage({
      theme: '직접등록',
      name,
      code: code || '000000',
      sector: '일반',
      price: 50000,
      change: 0,
      rate: 0.0,
      volume: 10000,
      tradeValue: 5,
      foreign: '0',
      inst: '0',
      dayCandle: { left: 40, width: 20, up: true },
      date: todayStr,
      memo: memo || '직접 추가됨'
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
// 5. 구글 Gemini API 호출 (다중 종목 전수 추출)
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
    
    // 다중 종목 전수 추출을 강제하는 시스템 프롬프트
    const systemPrompt = `
당신은 대한민국 최고 수준의 전문 주식 리서치 애널리스트입니다.
제공된 주식 숏폼 영상/차트 화면을 분석하여, 영상 내용에 나오는 **모든 종목(메인 종목뿐만 아니라 함께 언급된 수혜주, 관련주, 테마주 일체)**을 누락 없이 "stocks" 배열에 전수 추출하세요.
절대로 1개 종목만 추출하고 끝내지 말고, 언급된 종목이 2개 이상이면 전부 포함해야 합니다.
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
      "theme": "테마/섹터명 (예: 변압기/AI전력)",
      "support": "지지선 가격 (예: 180,000원 또는 미제시)",
      "target": "목표가 (예: 220,000원 또는 미제시)",
      "reason": "다루는 이유 및 투자포인트 요약"
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
      parts.push({ text: `분석할 주식 쇼츠 영상 링크: ${url}\n오늘 날짜: ${todayStr}\n영상에 언급된 모든 종목을 빠짐없이 전수 추출하여 JSON으로 요약해 주세요.` });
    } else {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: currentUploadedBase64
        }
      });
      parts.push({ text: `첨부된 주식 차트/영상 화면을 분석하여 화면에 나타난 모든 종목과 투자 전략을 도출해 주세요. 오늘 날짜: ${todayStr}` });
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

// 결과 렌더링 (다중 종목 칩 및 개별 추가 버튼)
function renderAnalysisResult(res) {
  const resultCard = document.getElementById('resultCard');

  document.getElementById('resDateBadge').innerText = `📅 ${res.date || '오늘'}`;
  document.getElementById('resTypeBadge').innerText = res.trading_type || '스윙';
  
  const sentBadge = document.getElementById('resSentimentBadge');
  sentBadge.innerText = res.sentiment || '긍정';
  sentBadge.className = 'badge ' + (res.sentiment?.includes('매수') || res.sentiment?.includes('긍정') ? 'badge-buy' : 'badge-sell');

  // 다중 종목 렌더링
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
          <p>${s.reason || '투자 포인트'}</p>
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

// 개별 종목 추가
function addSingleDetectedStock(stock, dateStr) {
  const item = {
    theme: stock.theme || '쇼츠추천',
    name: stock.name,
    code: stock.code || '000000',
    sector: '일반',
    price: 50000,
    change: 1500,
    rate: 3.09,
    volume: 120000,
    tradeValue: 60,
    foreign: '+1.5만',
    inst: '+8천',
    dayCandle: { left: 40, width: 35, up: true },
    date: dateStr || new Date().toISOString().split('T')[0],
    memo: stock.reason || '쇼츠 AI 추천'
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
    addStockToStorage({
      theme: stock.theme || '쇼츠추천',
      name: stock.name,
      code: stock.code || '000000',
      sector: '일반',
      price: 50000,
      change: 1500,
      rate: 3.09,
      volume: 120000,
      tradeValue: 60,
      foreign: '+1.5만',
      inst: '+8천',
      dayCandle: { left: 40, width: 35, up: true },
      date: dateStr,
      memo: stock.reason || '쇼츠 AI 추천'
    });
  });
  renderExcelWatchlist();
  alert(`✅ 포착된 ${currentAnalysis.stocks.length}개 종목이 모두 관심종목 테이블에 등록되었습니다!`);
}

// 리포트 복사
function handleCopyReport() {
  if (!currentAnalysis) return;
  const stockSummary = (currentAnalysis.stocks || []).map(s => `- ${s.name}(${s.code}): ${s.reason} [목표가: ${s.target}]`).join('\n');
  const text = `[주식 쇼츠 AI 다중 종목 리포트]
- 일자: ${currentAnalysis.date} | 관점: ${currentAnalysis.sentiment}
- 포착된 종목들:
${stockSummary}
- 핵심 3줄 요약:
${currentAnalysis.summary_3lines?.map(s => '• ' + s).join('\n')}`;

  navigator.clipboard.writeText(text).then(() => {
    alert('📋 전체 분석 리포트가 클립보드에 복사되었습니다.');
  });
}

// ==========================================
// 6. 엑셀 스타일 요일별 실시간 금융 테이블 렌더링
// ==========================================
function initWatchlist() {
  const saved = localStorage.getItem(STORAGE_KEY_WATCHLIST);
  if (!saved) {
    localStorage.setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(DEFAULT_WATCHLIST));
  }
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

// 요일 문자열 생성 (예: 2026-10-19 (월))
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

// 엑셀 양식 요일별 테이블 렌더링
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

  // 날짜별 그룹핑
  const groups = {};
  list.forEach(item => {
    const d = item.date || '날짜 미상';
    if (!groups[d]) groups[d] = [];
    groups[d].push(item);
  });

  // 각 요일별 블록 렌더링
  Object.keys(groups).forEach(dateKey => {
    const items = groups[dateKey];
    const block = document.createElement('div');
    block.className = 'weekday-block';

    const header = document.createElement('div');
    header.className = 'weekday-header';
    header.innerHTML = `
      <span>📅 ${getWeekdayLabel(dateKey)}</span>
      <span style="font-size:0.8rem; font-weight:600; opacity:0.9;">총 ${items.length}종목 감시</span>
    `;
    block.appendChild(header);

    // 엑셀 스타일 가로 스크롤 테이블
    const scrollArea = document.createElement('div');
    scrollArea.className = 'excel-scroll-area';

    let tableHtml = `
      <table class="excel-table">
        <thead>
          <tr>
            <th>테마</th>
            <th>종목명 (코드)</th>
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
      const candle = stock.dayCandle || { left: 40, width: 30, up: isUp };

      tableHtml += `
        <tr>
          <td><span class="theme-tag">${stock.theme || '추천'}</span></td>
          <td>
            <span class="stock-name-cell">${stock.name}</span>
            <span class="stock-code-cell">${stock.code}</span>
          </td>
          <td style="color:#94a3b8; font-size:0.78rem;">${stock.sector || '-'}</td>
          <td style="font-weight:700;">${Number(stock.price || 0).toLocaleString()}원</td>
          <td class="${rateClass}">${rateSign}${Math.abs(stock.rate || 0).toFixed(2)}%</td>
          <td style="color:#cbd5e1;">${stock.tradeValue || 0}억</td>
          <td style="text-align:center;">
            <div class="candle-bar-container">
              <span class="candle-bar ${candle.up ? 'candle-up' : 'candle-down'}" style="left:${candle.left}%; width:${candle.width}%;"></span>
            </div>
          </td>
          <td style="color:${String(stock.foreign).includes('+') ? '#f87171' : '#60a5fa'};">${stock.foreign || '-'}</td>
          <td style="color:${String(stock.inst).includes('+') ? '#f87171' : '#60a5fa'};">${stock.inst || '-'}</td>
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
  // 5초마다 시세 미세 갱신
  liveInterval = setInterval(() => {
    updateLivePrices(false);
  }, 5000);
}

function updateLivePrices(isManual = false) {
  const list = getWatchlist();
  if (list.length === 0) return;

  // 장중 시세 변동 시뮬레이션
  list.forEach(item => {
    const delta = (Math.random() - 0.49) * 0.005; // -0.25% ~ +0.25% 미세 변동
    const newRate = Number(((item.rate || 0) + delta).toFixed(2));
    const newPrice = Math.round((item.price || 50000) * (1 + delta));
    item.price = newPrice;
    item.rate = newRate;
    item.dayCandle = {
      left: Math.max(10, Math.min(60, (item.dayCandle?.left || 40) + Math.round(delta * 100))),
      width: Math.max(15, Math.min(50, item.dayCandle?.width || 30)),
      up: newRate >= 0
    };
  });

  localStorage.setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(list));
  renderExcelWatchlist();

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  document.getElementById('liveRefreshTime').innerText = `● ${timeStr} 시세 실시간 갱신`;

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
