// app.js - 구글 Gemini 연동 24시간 모바일 주식 쇼츠 AI 비서

const STORAGE_KEY_API = 'stock_shorts_gemini_api_key';
const STORAGE_KEY_WATCHLIST = 'stock_shorts_watchlist_items';

// 기본 더미 초기 관심종목 데이터 (최초 실행 시)
const DEFAULT_WATCHLIST = [
  { name: '산일전기', code: '062040', memo: '변압기 수주 호황 및 실적 모멘텀' },
  { name: 'LS ELECTRIC', code: '010120', memo: '북미 전력 인프라 확대 수혜' },
  { name: '우리넷', code: '115440', memo: '양자암호통신 및 5G 모듈' }
];

let currentAnalysis = null;

// ==========================================
// 1. 초기화 및 이벤트 리스너
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initModals();
  initWatchlist();
  initPWA();

  // API 키가 없으면 설정 모달 자동 팝업
  if (!getApiKey()) {
    showSettingsModal();
  }

  // 붙여넣기 버튼
  document.getElementById('btnPaste').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        document.getElementById('videoUrlInput').value = text.trim();
      }
    } catch (err) {
      alert('클립보드 읽기 권한을 허용해 주시거나 직접 링크를 길게 눌러 붙여넣으세요.');
    }
  });

  // 분석 버튼
  document.getElementById('btnAnalyze').addEventListener('click', handleAnalyze);

  // 관심종목 추가 버튼
  document.getElementById('btnAddToWatchlist').addEventListener('click', handleAddAnalyzedStock);

  // 리포트 복사 버튼
  document.getElementById('btnCopyReport').addEventListener('click', handleCopyReport);
});

// ==========================================
// 2. 탭 제어
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
    });
  });
}

// ==========================================
// 3. 모달 제어
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

  // 키 저장 버튼
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

  // 직접 종목 추가 확인
  document.getElementById('btnConfirmAddStock').addEventListener('click', () => {
    const name = document.getElementById('addStockName').value.trim();
    const code = document.getElementById('addStockCode').value.trim();
    const memo = document.getElementById('addStockMemo').value.trim();

    if (!name) {
      alert('종목명을 입력해 주세요.');
      return;
    }

    addStockToStorage({ name, code: code || '000000', memo: memo || '직접 추가됨' });
    addModal.classList.add('hidden');
    renderWatchlist();
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
// 4. 구글 Gemini API를 통한 틱톡/쇼츠 분석
// ==========================================
async function handleAnalyze() {
  const url = document.getElementById('videoUrlInput').value.trim();
  if (!url) {
    alert('틱톡(TikTok) 또는 유튜브 쇼츠 링크를 먼저 입력해 주세요.');
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
사용자가 제공한 주식 숏폼 영상 링크(틱톡 또는 유튜브 쇼츠)를 분석하여 주식 투자에 꼭 필요한 정보를 도출하세요.
만약 영상 접근이 불가능하거나 링크만 주어진 경우, URL과 플랫폼 맥락, 그리고 최신 한국 주식 시장의 흐름을 바탕으로 추론하여 반드시 아래 순수 JSON 형식으로만 응답하세요. (마크다운 코드블록이나 다른 설명 제외)

JSON 스키마:
{
  "date": "YYYY-MM-DD (영상 속 날짜 또는 ${todayStr})",
  "stock_name": "대표 종목명",
  "stock_code": "6자리 공식 종목코드",
  "trading_type": "단기스윙 / 단타 / 중장기 / 테마주 중 1개",
  "sentiment": "긍정·매수 / 중립·관망 / 매도·주의 중 1개",
  "summary_3lines": [
    "1. 첫 번째 핵심 모멘텀/호재 요약",
    "2. 두 번째 수급 또는 차트 포인트 요약",
    "3. 세 번째 화자의 매매 전략 및 결론 요약"
  ],
  "support": "지지선 가격 (예: 72,000원 또는 미제시)",
  "resistance": "저항선 가격 (예: 78,000원 또는 미제시)",
  "target": "목표가 (예: 85,000원 또는 미제시)",
  "stop_loss": "손절선 (예: 70,000원 또는 미제시)"
}
`;

    const userPrompt = `분석할 주식 쇼츠 영상 링크: ${url}\n오늘 날짜: ${todayStr}\n위 링크의 주식 핵심 내용을 완벽히 요약해 주세요.`;

    // 지원 모델 후보군 (1순위: 최신 gemini-3.8-flash, 2순위: 2.5, 3순위: 1.5)
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
            contents: [
              { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }
            ],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json'
            }
          })
        });

        if (response.ok) {
          data = await response.json();
          break; // 성공 시 루프 탈출
        } else {
          const errData = await response.json().catch(() => ({}));
          lastError = new Error(errData.error?.message || `HTTP ${response.status}`);
          // 만약 모델 지원 종료 오류면 다음 모델 시도
          if (errData.error?.message?.includes('no longer available') || errData.error?.message?.includes('not found')) {
            console.warn(`[모델 폴백] ${model} 실패, 다음 모델 시도...`);
            continue;
          } else {
            throw lastError;
          }
        }
      } catch (e) {
        lastError = e;
      }
    }

    if (!data) {
      throw lastError || new Error('모든 Gemini 모델 호출에 실패했습니다.');
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('AI 응답을 받지 못했습니다.');

    const parsed = JSON.parse(rawText);
    currentAnalysis = parsed;
    renderAnalysisResult(parsed);

  } catch (err) {
    console.error(err);
    alert(`[분석 오류] ${err.message}\nAPI 키가 올바른지 확인해 주세요.`);
  } finally {
    loadingBox.classList.add('hidden');
  }
}

// 결과 렌더링
function renderAnalysisResult(res) {
  const resultCard = document.getElementById('resultCard');

  document.getElementById('resDateBadge').innerText = `📅 ${res.date || '오늘'}`;
  document.getElementById('resTypeBadge').innerText = res.trading_type || '스윙';
  
  const sentBadge = document.getElementById('resSentimentBadge');
  sentBadge.innerText = res.sentiment || '긍정';
  sentBadge.className = 'badge ' + (res.sentiment?.includes('매수') || res.sentiment?.includes('긍정') ? 'badge-buy' : 'badge-sell');

  document.getElementById('resStockTitle').innerText = `${res.stock_name} (${res.stock_code})`;

  const listEl = document.getElementById('resSummaryList');
  listEl.innerHTML = '';
  (res.summary_3lines || []).forEach(line => {
    const li = document.createElement('li');
    li.innerText = `• ${line}`;
    listEl.appendChild(li);
  });

  document.getElementById('resSupport').innerText = res.support || '미제시';
  document.getElementById('resResistance').innerText = res.resistance || '미제시';
  document.getElementById('resTarget').innerText = res.target || '미제시';
  document.getElementById('resStopLoss').innerText = res.stop_loss || '미제시';

  resultCard.classList.remove('hidden');
}

// 분석된 종목을 관심종목에 추가
function handleAddAnalyzedStock() {
  if (!currentAnalysis) return;
  const item = {
    name: currentAnalysis.stock_name,
    code: currentAnalysis.stock_code,
    memo: currentAnalysis.summary_3lines?.[0] || '쇼츠 AI 추천'
  };
  addStockToStorage(item);
  renderWatchlist();
  alert(`✅ '${item.name}' 종목이 내 관심종목에 등록되었습니다!`);
}

// 리포트 복사
function handleCopyReport() {
  if (!currentAnalysis) return;
  const text = `[주식 쇼츠 AI 요약] ${currentAnalysis.stock_name}(${currentAnalysis.stock_code})
- 일자: ${currentAnalysis.date} | 관점: ${currentAnalysis.sentiment}
- 핵심요약:
${currentAnalysis.summary_3lines?.map(s => '• ' + s).join('\n')}
- 가격대: 지지 ${currentAnalysis.support} / 목표 ${currentAnalysis.target} / 손절 ${currentAnalysis.stop_loss}`;

  navigator.clipboard.writeText(text).then(() => {
    alert('📋 분석 리포트가 클립보드에 복사되었습니다. 카카오톡이나 메모장에 붙여넣으세요.');
  });
}

// ==========================================
// 5. 관심종목 관리 (LocalStorage)
// ==========================================
function initWatchlist() {
  const saved = localStorage.getItem(STORAGE_KEY_WATCHLIST);
  if (!saved) {
    localStorage.setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(DEFAULT_WATCHLIST));
  }
  renderWatchlist();
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
  // 중복 제거
  const filtered = list.filter(s => s.name !== item.name);
  filtered.unshift(item);
  localStorage.setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(filtered));
}

function deleteStockFromStorage(name) {
  const list = getWatchlist().filter(s => s.name !== name);
  localStorage.setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(list));
  renderWatchlist();
}

function renderWatchlist() {
  const list = getWatchlist();
  document.getElementById('stockCount').innerText = list.length;
  const container = document.getElementById('watchlistContainer');
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = `<p style="text-align:center; color:#6b7280; padding:20px;">등록된 관심종목이 없습니다.</p>`;
    return;
  }

  list.forEach(item => {
    const card = document.createElement('div');
    card.className = 'stock-card';
    card.innerHTML = `
      <div class="stock-info">
        <h4>${item.name} <span style="font-size:0.8rem; color:#9ca3af;">(${item.code})</span></h4>
        <p>${item.memo || '쇼츠 AI 추천 종목'}</p>
      </div>
      <button class="stock-del-btn" title="삭제">&times;</button>
    `;
    card.querySelector('.stock-del-btn').addEventListener('click', () => {
      if (confirm(`'${item.name}' 종목을 삭제하시겠습니까?`)) {
        deleteStockFromStorage(item.name);
      }
    });
    container.appendChild(card);
  });
}

// ==========================================
// 6. PWA 서비스 워커 등록
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
